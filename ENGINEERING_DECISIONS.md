# Engineering Decisions

Decisions are added as each part of the project is built.

## Architecture

**Modular monolith, two packages in one repo.** `server/` is a single Express app, `client/` is a single React app, joined by npm workspaces so one `npm install` and one CI run cover both. No microservices or shared packages: there is one team, one deployable API, and nothing that needs to scale independently.

**Server layering: route → controller → service → model** (each layer is added when the first feature needs it). Routes only declare the URL and middleware chain. Controllers read the request and call one service. Services hold the business rules (slot validation, status transitions, booking). Models define the schemas and indexes. This keeps controllers thin and puts everything worth testing in one place. There is no repository layer: services call Mongoose directly, because a second layer over Mongoose would only forward calls.

**Express 5.** Rejected promises in async handlers reach the error handler on their own, so no wrapper is needed around every controller.

**Centralised errors and responses.** Services throw `AppError(status, code, message)`. One error middleware turns that, Zod validation errors and unknown errors into the same envelope, and unknown errors never leak internals to the client. One `sendSuccess` helper builds the success envelope.

**Config is validated at boot.** `config/env.ts` parses `process.env` with Zod, so a wrong variable stops the server at startup instead of failing on the first request that needs it. Variables with no safe default (database URI, JWT secrets) are required and are added as the features that use them arrive. Node's `--env-file` flag loads `.env`, so there is no dotenv dependency.

**Client state.** TanStack Query owns server data (caching, loading and error states, pagination, refetch on live updates). React state and the URL cover everything else. There is no global store.

**Vite dev proxy.** `/api` is proxied to the server so the browser sees one origin and local development needs no CORS setup.

## MongoDB schema

**Seven collections:** users, departments, patients, appointments, refreshtokens, auditlogs, counters.

**One `users` collection for all roles.** Doctors, receptionists and admins all log in the same way, so they share a collection and a `role` field. A doctor's department, slot length and weekly schedule live in an embedded `doctorProfile`. A schedule is always read together with its doctor and never queried on its own, so embedding saves a join, and `appointment.doctorId` is simply the user's `_id`.

**Appointments are separate documents that reference patient, doctor and department.** They are queried by doctor and date, so they can't be embedded in a doctor or patient. `departmentId` is copied from the doctor when booking so the department filter doesn't need a lookup.

**Date and time are strings.** `date` is `YYYY-MM-DD` and `slotStart`/`slotEnd` are `HH:mm`, all in the clinic's local time. Slots are wall-clock times at one clinic, so stored instants would only add timezone and daylight-saving conversions. The strings sort and compare correctly, which is all the date-range filter and sorting need.

**`isActive` on appointments.** It is true while an appointment holds its slot and set to false when it is cancelled. A partial unique index can only filter on simple equality, so a boolean is the easiest way to say "only live bookings count".

**`nameLower` on patients.** A lowercase copy of the name so that searching by the start of a name is an anchored prefix match on an index instead of a scan.

**Mobile numbers are not unique.** Family members often share a number, so a unique index would block legitimate bookings.

## Indexes

Each index is there for a query the screens will run:

- `departments.name` and `departments.code` (unique): no duplicate departments.
- `users.email` (unique): login lookup and duplicate-email protection.
- `users {role, doctorProfile.departmentId}`: listing doctors, optionally by department.
- `patients.patientCode` (unique), `patients.mobile`, `patients.nameLower`: the three ways receptionists look a patient up.
- `appointments {doctorId, date, slotStart}` (unique, partial on `isActive: true`): prevents double booking and doubles as the lookup of one doctor's bookings on a date. Cancelled appointments are left out, so the index stays small and a cancelled slot can be booked again.
- `appointments {doctorId, date, status}`: a doctor's own list, including cancelled, and status filters.
- `appointments {date, slotStart}`: date-range lists across doctors and the default sort.
- `appointments {departmentId, date}`: department filter.
- `appointments {patientId, date desc}`: looking up a patient's appointments.
- `refreshtokens.tokenHash` (unique): token lookup. `refreshtokens.userId`: revoke all of a user's tokens in one query. `refreshtokens.expiresAt` (TTL): MongoDB deletes expired tokens by itself.
- `auditlogs {createdAt}` and `{entityType, entityId, createdAt}`: recent activity and the history of one record.

Not every filter combination is indexed. Each extra index slows down writes, so only the combinations above are covered.

## Authentication

**Two tokens.** A short-lived access token (15 minutes) is sent on every API call and holds only the user id and role, so checking it needs no database lookup. A longer-lived refresh token (7 days) exists only to get a new access token.

**Where the tokens live.** The access token is returned in the response body and kept in memory by the client, so injected scripts can't read it from storage. The refresh token is an httpOnly, SameSite=Strict cookie limited to `/api/v1/auth`, so scripts can't read it and the browser only sends it to the auth routes. SameSite=Strict keeps the browser from sending it on cross-site requests, which covers CSRF for the one endpoint that uses it.

**Refresh tokens are single-use and stored hashed.** Only a SHA-256 hash is saved, so a database leak doesn't give out usable tokens. On refresh the old token is deleted and a new one issued. The delete is atomic, so two requests racing with the same token can't both succeed. If a valid token is no longer stored, it was already used, so every refresh token of that user is deleted and they have to log in again. Logout deletes the token.

**Two separate secrets** sign the access and refresh tokens, so one can't be passed off as the other. Verification pins the algorithm to HS256.

**Login answers the same way for every failure.** Unknown email, wrong password and inactive account all return the same 401 message. When the email doesn't exist, the password is still compared against a dummy hash so response time doesn't reveal which emails are registered. Passwords are hashed with bcrypt (cost 12). Login is limited to 10 attempts per 15 minutes per IP.

**Authorization is checked on the server.** `authorize(...roles)` runs on each route after `authenticate`. The role comes from the signed token, never from the request.

**Audit trail.** Logins (successful and failed) and logouts are written to `auditlogs`. A failed audit write is logged but does not fail the request.

**One refresh at a time.** Because a reused refresh token ends every session, the client must send a single refresh request at a time and share its result (two simultaneous refreshes with the same cookie look like theft to the server).

**Behind a proxy.** The login limiter keys on the client IP, so when the API is deployed behind a reverse proxy, `trust proxy` has to be configured or every user shares the proxy's address.

**Known limit.** A deactivated user's current access token keeps working until it expires (at most 15 minutes), because access tokens are not checked against the database.

## Client authentication

**Session state is one React context.** `AuthProvider` holds the current user. On load it calls `/auth/refresh`, because after a page reload the in-memory access token is gone but the refresh cookie is still there. Until that call finishes, the route guard shows a spinner instead of flashing the login page.

**One shared refresh request.** The refresh token works once, and the server treats a second use as theft. So every caller of `refreshSession()` shares the same in-flight request. This matters in development, where React StrictMode runs effects twice, and whenever several API calls hit an expired token at the same time.

**Expired access tokens are handled in one place.** The `http` wrapper attaches the token, and on a 401 from any non-auth route it refreshes once and retries the request. If the refresh fails, the session is cleared and the user is sent to the login page.

**The route guard is only for convenience.** `RequireAuth` keeps people out of screens they can't use, but every API route checks the token and role again on the server, so hiding a screen is never what protects data.

**One origin, no cookie flags in the client.** The browser talks to the API on its own origin (the Vite proxy in development, a reverse proxy in production), so `fetch` needs no CORS or credentials options for the refresh cookie to be sent.

**Only a rejected refresh ends the session.** If a refresh fails with 401, or a retried request is still rejected, the user is signed out. A network error or server failure leaves them signed in so a brief outage doesn't throw away their session.

**Cached data is cleared on logout** so the next person on the same browser never sees the previous user's data.

**Forms use React Hook Form with Zod.** Validation runs in the browser for quick feedback, and the server validates again, since the browser can't be trusted.

## Doctors and schedules

**One schedule per doctor, replaced as a whole.** `PUT /doctors/:id/schedule` takes the complete schedule instead of per-day or per-session endpoints. The editor always shows the whole week, so a single request is simpler and keeps the stored schedule consistent: it is either the old one or the new one, never half of each.

**Schedule rules are checked on the server.** The slot generator in the next step relies on well-formed input, so bad schedules are rejected up front: end before start, overlapping sessions or breaks, a repeated day, and slot lengths outside 5-120 minutes. The client doesn't repeat these rules; it shows the server's messages in plain language, and only offers slot lengths from a fixed list.

**A break can sit inside a session or in the gap between two.** The assessment's example (09:00-12:00, lunch 12:00-13:00, 13:00-17:00) is the gap case, but a tea break inside a session works the same way, so breaks are stored per day next to sessions.

**One form for both staff types.** Doctors and receptionists need the same name, email and password, so the client has a single `StaffForm`; doctors add department and specialization. On the server, `createStaff` is shared too, so password hashing, the duplicate-email check and the audit entry exist once.

**Duplicate emails** are detected by the unique index (a 409), not by checking first, so two simultaneous requests can't both succeed.

**Role-gated screens.** The Doctors and Receptionists pages are admin only. The route guard and the nav links hide them from other roles, and the API enforces the same rule on every request.

## Slot generation

**Slots are calculated, not stored.** Each request builds the day's slots from the doctor's schedule. Stored slots would have to be regenerated and cleaned up whenever a schedule changes, and would leave stale rows behind. The only thing stored is the appointment, and its unique index already records which slots are taken.

**How a day is built.** The weekday comes from the date, read as UTC so the server's own timezone can't move it by a day. Each session is cut into slots of the doctor's slot length starting at the session's start time, and a slot is dropped if it touches any break. So a break in the middle of a session removes the slots it covers and the rest stay on the same grid. A break that doesn't line up with the grid removes every slot it touches. Time left over at the end of a session that is shorter than a slot is dropped, which also guarantees slots never overlap and never run past the end of a session.

**Past slots use the clinic's clock.** Dates and times are wall-clock values in one timezone (`CLINIC_TIMEZONE`, default Asia/Kolkata), so "is this slot in the past" compares the slot with the current date and time in that zone, worked out with `Intl.DateTimeFormat` and no date library. A slot counts as past once it has started. The function takes "now" as a parameter so the tests can fix the time.

**The server decides, the screen only shows.** The status of each slot comes from the API. The client has no logic for deciding what is in the past, so it can't disagree with what the booking endpoint will accept. The only date it works out itself is the initial value of the date picker, taken from the browser's date.

**One query for bookings.** Bookings for the day come from a single lookup on doctor, date and active appointments, which matches the unique slot index. A booked slot shows as booked even after its time has passed, so the history of the day stays visible.

**Known limit.** If a schedule is edited after appointments exist, those appointments stay in the database and appear in the appointment list, but the scheduler only draws slots the current schedule generates, so an appointment on a slot that no longer exists isn't shown in the grid.

## Preventing double booking

**The database enforces it, not the application.** Appointments have a unique index on doctor, date and slot start, limited to documents where `isActive` is true. If two requests try to book the same slot at the same moment, both inserts reach MongoDB and exactly one succeeds. The other gets a duplicate-key error, which the service turns into `409 SLOT_ALREADY_BOOKED`. Nothing in the application has to be correct about timing for this to hold.

**Why not "check, then insert".** Two requests can both check, both see the slot free, and both insert. The check only narrows the window. The service still does one before inserting, but only so most late requests fail early and cheaply, before a patient record is created for them. A comment in the code says the index is the real guard. Removing the check doesn't change the outcome: the concurrency test below passes without it, because the index alone decides the winner.

**Cancelled appointments free the slot.** A cancelled appointment is kept for the record but has `isActive: false`, so it drops out of the index and the slot can be booked again. This is why the index is partial and why `isActive` exists at all.

**No transactions.** The one rule that has to be atomic, one active appointment per doctor slot, lives in a single document and a unique index, so a plain insert is enough. Transactions would also require a replica set for every local setup.

**New patient plus appointment is two writes.** A new patient is created before the appointment so the appointment has something to point to. If the appointment insert then loses the race, the service deletes the patient it just created, so losing requests don't leave stray records. A test fires 12 simultaneous bookings of one slot with new patients and checks that exactly one appointment and one patient remain. If the process died between the two writes, the only leftover would be an unused patient record, which is harmless.

**The server decides what a valid slot is.** The client sends only a start time. The server rebuilds the doctor's slots for that date and rejects anything that isn't one of them (a break, a time off the grid, outside working hours, a non-working day) and anything that has already started. So a request made directly to the API can't book what the scheduler wouldn't offer.

## Patients

**Patient IDs come from an atomic counter.** `PT-000001`, `PT-000002`, … are generated with a single `$inc` on a counter document, so two patients registered at once never get the same ID. An ID is not reused if a patient is deleted after losing a booking race.

**Search is a prefix match.** A search term matches patient IDs exactly, the start of a mobile number, or the start of a name (case-insensitive). The prefix matches use the indexes on those fields. The cost is that a name search starts at the beginning of the full name, so "nair" won't find "Asha Nair". For the clinic sizes this module targets that is acceptable. A search index over words would be the next step, covered in the scaling notes.

**Mobile numbers are stored without spaces or dashes** and aren't unique, since family members often share one number.

**The search term is treated literally.** It is escaped before being used in a pattern, so characters like `.*` can't turn a search into a broad regular expression.

## Appointment status workflow

**One table of allowed moves.** `utils/appointmentStatus.ts` lists, for each status, the statuses it may move to: scheduled to arrived or cancelled, arrived to completed, and nothing after completed or cancelled. Every status change goes through it, so an impossible move (cancelling a patient who has already arrived, completing a visit that never started) is refused in one place instead of being checked in several.

**Changes are conditional on the status that was read.** The update only applies if the appointment is still in the status the service just looked at. If a receptionist marks a patient arrived while another cancels the same appointment, exactly one succeeds and the other gets a 409 telling them to refresh. A test runs both at once.

**Cancelling keeps the record.** The appointment stays in the database with a cancellation time and who cancelled it, and drops out of the slot index, so the slot can be booked again. Nothing is deleted, which keeps the audit trail meaningful.

**"Arrived" only on the day.** Marking tomorrow's patient as arrived is almost certainly a mistake, so the server refuses it.

**Roles decide which fields can change.** Front desk staff edit the purpose and booking notes. Only doctors write consultation notes, and only for their own patients once the patient has arrived. A request that touches a field the caller's role can't change is a `403`, not silently ignored. Consultation notes are clinical, so they are left out of what receptionists receive.

**Another doctor's appointment doesn't exist.** A doctor asking for an appointment that belongs to someone else gets a `404`, the same as for an id that doesn't exist, so the response doesn't confirm that it exists.

## Searching, filtering and paging appointments

**Everything is decided on the server.** The page of results, the total, the sorting and every filter come from the API, and the screen only shows them.

**One query for the list.** The list is a single query plus a count, run together. The patient and doctor for the page are then fetched with one lookup each, however many rows there are, so a page costs a fixed four queries and never one per row.

**Searching by patient, mobile or doctor name** first finds the matching patient or doctor ids, but only when that filter is used, then filters appointments by those ids. A plain list does no extra lookups. The patient lookup is capped at 1,000 ids, which is far more than a page of results can use.

**Sorting can't be steered by the caller.** The sort field comes from a fixed list (`date`, `createdAt`, `status`); anything else is rejected. The record id is always the last sort key, so pages don't repeat or skip rows when many appointments share a date.

**Page size is capped at 50, and the page number at 10,000,** so one request can't ask for the whole table or make the database skip an absurd number of rows.

**What the indexes cover.** The default list (all appointments, newest first) matches the `{date, slotStart, _id}` index exactly, so it needs no in-memory sorting. Lists narrowed by doctor, department, status or patient use the index for that filter and then sort the (much smaller) filtered set in memory, and sorting by status or creation time has no index at all. That is fine for one clinic's data. At millions of appointments the next step would be indexes that pair each common filter with the sort, or a search service, as described in the scaling notes.

**Counting.** The total is an exact count when filters are applied. With no filters it uses the collection's own estimate, which is instant instead of a scan.

**Dates are compared as strings.** Appointment dates are stored as `YYYY-MM-DD`, which sort and compare correctly, so the date range filter uses the date index directly.

**Doctors can't widen their view.** For a doctor the doctor filter is forced to themselves; a different `doctorId` in the request is ignored.

## The dashboard

The summary is one aggregation over today's appointments (by clinic date, for a doctor only their own), so its cost depends on one day's appointments, not the whole history. The admin also sees how many doctors and patients exist. The client then asks the normal list endpoint for the first ten of today's appointments, so the dashboard reuses the list's permissions and shape instead of having its own.

## Keeping the screen in step

After arrive, cancel or complete, the client refetches the appointment lists, the scheduler's slots and the dashboard counts, so every screen shows the same thing. Live updates for other users' changes are added in the real-time step.

## Real-time updates

**Socket.IO, on the same server as the API.** Socket.IO handles reconnection, rooms and an authentication step on connect, which would otherwise have to be written by hand over plain WebSockets. It shares the HTTP server, so there is nothing extra to deploy.

**The server announces, the client asks.** An event says only that an appointment changed: its id, doctor, date, slot and new status. It never carries patient details. The client responds by refetching what is on screen through the normal API, where permissions are checked as usual. This keeps the socket from becoming a second path around the authorization rules, and means a missed or repeated event can't leave a screen with wrong data, because the next fetch is always the truth.

**Rooms decide who hears what.** On connect, receptionists and admins join one shared room and each doctor joins a room of their own. An appointment event goes to the shared room and to that appointment's doctor, so a doctor never hears about someone else's patients.

**Events are sent after the database write succeeds,** from the service that made the change. A request that fails (for example a booking that loses the race for a slot) sends nothing. A test checks this.

**Authentication.** The connection must present a valid access token, verified once at connect time with the same code the API uses. The client passes the token through a function that runs on every connection attempt, so a reconnect uses the current token. If the token has expired, the connection is refused with `UNAUTHORIZED` and the client renews it (sharing the single refresh request used for API calls) and reconnects.

**Reconnecting.** After any (re)connection the client refetches its screens, because events sent while it was offline are not replayed.

**Where the refetching lives.** One hook, mounted once in the app layout, listens for the events and invalidates the cached queries for slots, appointments and the dashboard. Only queries that are currently on screen refetch; the others are just marked stale. Screens need no code of their own to stay current.

**Known limits.** A socket is authorized when it connects. If a user is deactivated, or their token expires while they stay connected, the connection keeps working until it drops. With more than one server instance, Socket.IO needs a shared adapter (for example Redis) so an event reaches users connected to a different instance; the scaling notes cover this.

