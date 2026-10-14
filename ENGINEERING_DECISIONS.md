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

**Schedule rules are checked on the server.** The slot generator in the next step relies on well-formed input, so bad schedules are rejected up front: end before start, overlapping sessions or breaks, a repeated day, and slot lengths outside 5-120 minutes. The client shows the server's messages in plain language rather than duplicating the rules.

**A break can sit inside a session or in the gap between two.** The assessment's example (09:00-12:00, lunch 12:00-13:00, 13:00-17:00) is the gap case, but a tea break inside a session works the same way, so breaks are stored per day next to sessions.

**One form for both staff types.** Doctors and receptionists need the same name, email and password, so the client has a single `StaffForm`; doctors add department and specialization. On the server, `createStaff` is shared too, so password hashing, the duplicate-email check and the audit entry exist once.

**Duplicate emails** are detected by the unique index (a 409), not by checking first, so two simultaneous requests can't both succeed.

**Role-gated screens.** The Doctors and Receptionists pages are admin only. The route guard and the nav links hide them from other roles, and the API enforces the same rule on every request.
