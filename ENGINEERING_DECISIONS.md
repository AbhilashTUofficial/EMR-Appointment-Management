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
