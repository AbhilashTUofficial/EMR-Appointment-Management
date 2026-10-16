# EMR Appointment Management

An appointment management module for an electronic medical record (EMR) system, built with the MERN stack and TypeScript.

## Project overview

Receptionists book appointments from a live scheduler, doctors work through their own list and add consultation notes, and the admin sets up doctors, receptionists and weekly schedules. Slots are generated from each doctor's schedule, double booking is prevented by the database, and every open screen updates as soon as someone else changes an appointment.

The reasoning behind the main decisions is in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md). The application is not hosted; run it locally as described below.

**Roles**

| Role | Can do |
|---|---|
| Super Admin | Create doctors and receptionists, manage doctor schedules, see all appointments and dashboards, and do everything a receptionist can |
| Receptionist | Search patients, book appointments, edit purpose and notes, cancel, mark patients as arrived |
| Doctor | See only their own appointments and schedule, view patient details, add consultation notes, complete visits |

**Screens:** login, dashboard (today's counts and appointments), scheduler (department, doctor and date filters with a slot grid), booking, appointment list (search, filters, sorting, paging, actions), and for admins the doctor list with a schedule editor and a receptionist form.

## Stack

- **Server:** Node.js, Express 5, MongoDB with Mongoose, Zod, JWT, bcrypt, Socket.IO
- **Client:** React, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS (built with Vite)
- **Tests:** Vitest, Supertest, an in-memory MongoDB, socket.io-client; Testing Library and jsdom on the client
- **Versions:** TypeScript 7 builds and checks both packages; the repository root also carries TypeScript 6, which `typescript-eslint` requires for linting. The server pins `@types/node` 24 to match the Node 24 it targets, and the build tools bring their own newer copy. Node 22.22 is the minimum because React Router 8 needs it

## Folder structure

```
server/
  src/
    config/        env parsing and validation, database connection
    models/        Mongoose schemas and indexes
    validators/    Zod schemas for request bodies and queries
    middlewares/   authenticate, authorize, validate, rate limit, error handling
    routes/        URL and middleware chain per resource
    controllers/   thin request handlers
    services/      business logic (booking, slots, status workflow, auth, ...)
    utils/         AppError, response helper, time and token helpers
    types/         the signed-in user on Express requests
    scripts/       seed script and its safety check
    app.ts         Express app
    realtime.ts    Socket.IO setup and the publish function
    server.ts      entry point
  tests/           unit and integration tests
client/
  src/
    api/           fetch wrapper (token handling, refresh) and API calls
    auth/          auth context and route guard
    components/    shared UI: layout, form fields, modal, pagination, slot grid, ...
    hooks/         shared data queries, live updates
    pages/         one file per screen (admin screens in pages/admin)
docker-compose.yml, server/Dockerfile, client/Dockerfile   optional Docker setup
```

## Architecture overview

```
Browser (React) ── HTTP /api/v1 ──▶ route ─▶ middleware ─▶ controller ─▶ service ─▶ Mongoose ─▶ MongoDB
       ▲                                (authenticate, authorize, validate)       │
       └──────────── Socket.IO events ◀──────────────── publish ◀─────────────────┘
```

- **One Express app, one MongoDB, one React app.** Socket.IO shares the HTTP server.
- **Layers:** a route lists the middleware (login required, role allowed, body valid) and calls a thin controller; the controller calls a service; the service holds the business rules and talks to the models. Controllers contain no logic.
- **Authorization happens on the server.** The UI hides what a role can't use, but every route checks the role and services scope a doctor to their own data.
- **Live updates** are announcements, not data: the server says an appointment changed and each screen refetches through the normal API.
- **State on the client:** TanStack Query holds server data, the auth context holds the session, and filters live in the URL.

## Installation

Requires Node 22.22 or newer (developed on Node 24; `.nvmrc` says 24) and a MongoDB database (a local one, or an Atlas connection string).

```bash
npm install
cp server/.env.example server/.env
```

Then edit `server/.env`: set `MONGODB_URI`, two different `JWT_*_SECRET` values of at least 32 characters (`openssl rand -base64 48` makes one), and `SEED_PASSWORD`.

## Running

```bash
npm run seed -w server     # demo departments and accounts; safe to run again
npm run dev -w server      # API on http://localhost:4000
npm run dev -w client      # app on http://localhost:5173 (proxies /api and /socket.io to the API)
```

Seeded logins all use `SEED_PASSWORD`:

| Account | Role |
|---|---|
| `admin@emr.test` | Super Admin |
| `reception@emr.test` | Receptionist |
| `anita.rao@emr.test` | Doctor, General Medicine (Mon-Sat, lunch break) |
| `vikram.mehta@emr.test` | Doctor, Cardiology (Mon-Fri, tea break) |
| `sara.thomas@emr.test` | Doctor, Pediatrics (Mon, Wed, Fri) |

| Command | What it does |
|---|---|
| `npm run lint` | ESLint for both packages |
| `npm run typecheck` | `tsc --noEmit` for both packages |
| `npm test` | All server tests, using an in-memory MongoDB (the first run downloads a mongod binary) |
| `npm run build` | Builds the server (`server/dist`) and the client (`client/dist`) |
| `npm start -w server` | Runs the built server, reading `server/.env` if it exists (in production set `NODE_ENV=production` and a real `CLIENT_ORIGIN`) |

### Docker (optional)

```bash
cp .env.example .env       # fill in the two JWT secrets and SEED_PASSWORD
docker compose up --build  # app on http://localhost:8080
docker compose exec server node server/dist/scripts/seed.js
```

This starts MongoDB, the API and the web app behind nginx, which serves the built client and forwards `/api` and `/socket.io` to the API. It is a local demo setup (MongoDB without authentication, `NODE_ENV=development` so the seed script may run); it was built and run end to end with Docker Desktop (containers up, demo accounts seeded, sign-in and live updates working through nginx).

## Environment variables

See `server/.env.example`. The server refuses to start if a required value is missing or invalid.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test` or `production`. In production the refresh cookie is `Secure` |
| `PORT` | API port (default 4000) |
| `CLIENT_ORIGIN` | The one origin allowed by CORS (default `http://localhost:5173`) |
| `TRUST_PROXY` | Number of reverse proxies in front of the API (default 0). Set it behind a proxy so the login limiter sees real client addresses |
| `COOKIE_SECURE` | `true` or `false`: whether the refresh cookie is marked `Secure`. Defaults to on when `NODE_ENV` is `production` |
| `MONGODB_URI` | MongoDB connection string (required) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets, at least 32 characters each and different from each other (required) |
| `CLINIC_TIMEZONE` | IANA timezone appointment dates and times are in (default `Asia/Kolkata`) |
| `SEED_PASSWORD` | Password for the accounts created by the seed script |
| `ALLOW_SEED` | Set to `1` to let the seed script run against a database that is not local, or with `NODE_ENV=production`. Without it the script refuses, since it creates accounts with a shared password |

## Database design

MongoDB, seven collections. Dates are stored as `YYYY-MM-DD` strings and times as `HH:mm` strings in the clinic's timezone, so there are no timezone conversions in the data.

```
users ──< appointments >── patients
  │            │
  │            └── departments
  └─ doctorProfile.departmentId ── departments
users ──< refreshtokens
auditlogs, counters (standalone)
```

| Collection | Purpose |
|---|---|
| `users` | Super admins, receptionists and doctors. A doctor's department, slot length and weekly schedule (sessions and breaks) are embedded in `doctorProfile` |
| `departments` | Name and code |
| `patients` | Patient ID (`PT-000042`), name, mobile, gender, date of birth |
| `appointments` | Patient, doctor, department, date, slot, status, purpose and notes |
| `refreshtokens` | Hashed refresh tokens, removed automatically after they expire |
| `auditlogs` | Who did what to which record, and when |
| `counters` | Sequence numbers (used for patient IDs) |

**Sample documents**

```jsonc
// users (a doctor)
{
  "_id": "664e…", "name": "Dr. Anita Rao", "email": "anita.rao@emr.test", "role": "DOCTOR", "isActive": true,
  "doctorProfile": {
    "departmentId": "664d…", "slotDurationMinutes": 15,
    "workingDays": [{
      "day": 1,                                              // 0 = Sunday
      "sessions": [{ "name": "Morning", "start": "09:00", "end": "12:00" },
                   { "name": "Evening", "start": "13:00", "end": "17:00" }],
      "breaks":   [{ "name": "Lunch Break", "start": "12:00", "end": "13:00" }]
    }]
  }
}

// appointments
{
  "_id": "6650…", "patientId": "664f…", "doctorId": "664e…", "departmentId": "664d…",
  "date": "2026-10-19", "slotStart": "09:15", "slotEnd": "09:30",
  "status": "SCHEDULED", "isActive": true, "purpose": "Fever for 3 days", "notes": ""
}
```

**Indexes** (the reasoning for each is in ENGINEERING_DECISIONS.md)

| Collection | Index | Used for |
|---|---|---|
| `users` | `email` unique | Login, duplicate-email protection |
| | `{role, doctorProfile.departmentId}` | Listing doctors by department |
| `departments` | `name`, `code` unique | No duplicate departments |
| `patients` | `patientCode` unique, `nameTokens`, `mobileDigits`, `mobileLocal` | The three ways a patient is looked up: ID, any word of the name, a mobile number with or without country code |
| `appointments` | `{doctorId, date, slotStart}` unique, only where `isActive` | Prevents double booking; also the lookup of a doctor's bookings on a date |
| | `{doctorId, date, status}` | A doctor's own list and status filters |
| | `{date, slotStart, _id}` | Date-range lists and the default sort |
| | `{status, date, slotStart, _id}` | The list sorted by status |
| | `{createdAt, _id}` | The list sorted by when it was booked |
| | `{departmentId, date}` | Department filter |
| | `{patientId, date}` | A patient's appointments |
| `refreshtokens` | `tokenHash` unique, `userId`, `expiresAt` (expires itself) | Token lookup, revoking a user's tokens, cleanup |
| `auditlogs` | `{createdAt}`, `{entityType, entityId, createdAt}` | Recent activity, one record's history |

**Query strategy:** list queries run one filtered, sorted, paged query plus a count; the patient and doctor for a page are loaded with one lookup each, never one per row; patient searches match the start of a word of the name, or of a mobile number, so they can use the indexes (doctor-name search is a case-insensitive match over the small set of doctors); slots are calculated rather than stored, with one indexed lookup for the day's bookings.

## API documentation

All routes are under `/api/v1`. Send the access token as `Authorization: Bearer <token>` (except login and refresh). Dates are `YYYY-MM-DD`, times `HH:mm`.

**Response format**

```json
{ "success": true, "message": "OK", "data": {}, "meta": {} }
{ "success": false, "message": "Invalid request", "code": "VALIDATION_ERROR", "errors": [{ "field": "email", "message": "…" }] }
```

**Status codes:** `200`/`201` success, `400` invalid input or a rule such as booking a slot in the past, `401` not signed in, `403` role not allowed, `404` not found (also used for another doctor's data), `409` conflict (slot taken, patient already booked at that time, invalid status change, a schedule change that would strand bookings, email taken), `413` request body too large, `429` too many login attempts, `500` unexpected error (details never sent).

**Endpoints and roles** (SA = Super Admin, RC = Receptionist, DR = Doctor)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Sign in |
| POST | `/auth/refresh` | refresh cookie | New access token (the old refresh token stops working) |
| POST | `/auth/logout` | refresh cookie | Sign out |
| GET | `/departments` | SA, RC, DR | List departments |
| GET | `/doctors` | SA, RC, DR (self only) | List doctors, optional `?departmentId=` |
| POST | `/doctors` | SA | Create a doctor |
| PUT | `/doctors/:id/schedule` | SA | Replace a doctor's schedule |
| POST | `/receptionists` | SA | Create a receptionist |
| GET | `/slots` | SA, RC, DR (own) | A doctor's slots for a date |
| GET | `/patients` | SA, RC | Search patients |
| POST | `/appointments` | SA, RC | Book a slot |
| GET | `/appointments` | SA, RC, DR (own) | Search, filter, sort and page |
| GET | `/appointments/:id` | SA, RC, DR (own) | One appointment |
| PUT | `/appointments/:id` | SA, RC (purpose, notes); DR (consultation notes) | Edit |
| DELETE | `/appointments/:id` | SA, RC | Cancel (the record is kept) |
| POST | `/appointments/:id/arrive` | SA, RC | Mark the patient as arrived (only on the day) |
| POST | `/appointments/:id/complete` | DR (own) | Complete the visit |
| GET | `/dashboard/summary` | SA, RC, DR (own) | Today's counts by status |
| GET | `/health` | public | Liveness check |

### Authentication

`POST /auth/login` with `{ email, password }` returns `{ user, accessToken }` and sets the refresh token as an httpOnly cookie scoped to `/api/v1/auth`. The access token lasts 15 minutes and the refresh token 7 days. Each refresh token works once: refreshing issues a new one, and reusing an old one ends all of that user's sessions. Failed logins are limited to 10 per account per IP address and 50 per IP address, per 15 minutes. A blocked request says how many minutes to wait, and other accounts on the same network are not affected.

### Doctors and schedules

`POST /doctors` takes `{ name, email, password, departmentId, specialization? }` and creates a doctor with no working days. `PUT /doctors/:id/schedule` takes the whole schedule:

```json
{
  "slotDurationMinutes": 15,
  "workingDays": [{
    "day": 1,
    "sessions": [{ "name": "Morning", "start": "09:00", "end": "12:00" }],
    "breaks": [{ "name": "Lunch Break", "start": "12:00", "end": "13:00" }]
  }]
}
```

`day` is 0 (Sunday) to 6. Rejected with `400`: an end before a start, overlapping sessions, overlapping breaks, a day listed twice, a session shorter than one slot, and a slot length outside 5-120 minutes.

### Slots

`GET /slots?doctorId=&date=` returns the day's sessions with their slots, plus the breaks:

```json
{
  "isWorkingDay": true,
  "sessions": [{ "name": "Morning", "start": "09:00", "end": "12:00",
    "slots": [{ "start": "09:00", "end": "09:15", "status": "AVAILABLE" },
              { "start": "09:15", "end": "09:30", "status": "BOOKED", "appointmentId": "…" }] }],
  "breaks": [{ "name": "Lunch Break", "start": "12:00", "end": "13:00" }]
}
```

A slot is `BOOKED` if an active appointment holds it, `PAST` if it has already started (or the date is earlier), otherwise `AVAILABLE`. Slots never fall inside a break and never overlap.

### Patients and booking

`GET /patients?search=` returns up to 10 patients matching a patient ID (`PT-000042`), the start of a mobile number (with or without the country code, spaces or dashes), or the start of any word of the name (`das` finds `Rohan Das`).

`POST /appointments`:

```json
{
  "doctorId": "…", "date": "2026-10-19", "slotStart": "10:00",
  "purpose": "Fever for three days", "notes": "optional",
  "newPatient": { "name": "Asha Nair", "mobile": "98765 43210", "gender": "FEMALE", "dateOfBirth": "1990-05-01" }
}
```

For a patient who is already registered, send `"patientId": "…"` instead of `newPatient`. Send exactly one of the two. A new patient is registered with the next patient ID, and the appointment is linked to the patient, doctor, department and slot. Errors: `400` for invalid input, a time that isn't one of the doctor's slots (`SLOT_NOT_AVAILABLE`, which covers breaks and times off the slot grid) or a slot in the past (`SLOT_IN_PAST`); `404` for an unknown doctor or patient; `409 SLOT_ALREADY_BOOKED` when someone else got the slot first, and `409 PATIENT_ALREADY_BOOKED` when the patient already has an appointment at an overlapping time.

### Appointments

**Status workflow**

```
SCHEDULED ──arrive──▶ ARRIVED ──complete──▶ COMPLETED
    └──cancel──▶ CANCELLED
```

Any other change is `409 INVALID_STATUS_TRANSITION`. Editing a cancelled or completed appointment is `409 APPOINTMENT_CANCELLED` or `APPOINTMENT_COMPLETED`, a doctor's notes before the patient has arrived are `409 PATIENT_NOT_ARRIVED`, and a change that lost a race with someone else's is `409 APPOINTMENT_CHANGED`. A cancelled or completed appointment can't be edited by the front desk, and a doctor can add consultation notes only once the patient has arrived. Consultation notes are never sent to receptionists. A doctor asking for another doctor's appointment gets `404`.

**List query parameters** for `GET /appointments`

| Parameter | Meaning |
|---|---|
| `page`, `limit` | Page number (default 1, at most 10,000) and page size (default 20, at most 50) |
| `sortBy`, `order` | `date` (default), `createdAt` or `status`; `asc` or `desc` (default) |
| `patient` | Patient name (start of it) or patient ID |
| `mobile` | Start of the patient's mobile number |
| `doctor` | Part of the doctor's name |
| `doctorId`, `departmentId`, `status` | Exact filters |
| `from`, `to` | Date range, inclusive |

The response is `{ data: [...], meta: { page, limit, total, totalPages } }`. Unknown sort fields, a limit over 50 and malformed dates are rejected with `400`.

### Live updates

Open screens update without a refresh. The server sends these Socket.IO events after the change is saved:

| Event | When |
|---|---|
| `appointment:created` | A slot is booked |
| `appointment:updated` | Details are edited, the patient arrives, or the visit is completed |
| `appointment:cancelled` | An appointment is cancelled |
| `schedule:updated` | A doctor's schedule is saved, which changes the slots on offer (carries only `{ doctorId }`) |

Appointment events carry only `{ id, doctorId, date, slotStart, status }`, never patient details. The client reacts by refetching what is on screen. Connecting needs the same access token as the API (`auth: { token }` in the handshake). Receptionists and admins receive every event; a doctor only receives events for their own appointments.

### Audit log

Logins (successful and failed), logouts, user creation, schedule changes, patient registration, and appointment creation, edits, arrivals, completions and cancellations are written to the `auditlogs` collection with the user, role, action, record and time.

## Testing

`npm test` runs about 240 server tests against an in-memory MongoDB, and about 40 client unit tests. They cover slot generation (sessions, breaks, past slots, timezone), the status workflow, booking and a concurrent double-booking attempt, authentication and token rotation, a role-by-endpoint access matrix, appointment search, filtering and paging, and the live events. The client's unit tests cover the API wrapper (token refresh, errors), sign-out, server-error handling in forms, formatting, the live-update hook and the dialog; its screens are checked by the type checker, the linter and by hand in a browser.

## Assumptions made

- One clinic, in one timezone (`CLINIC_TIMEZONE`). Dates and times are clinic wall-clock values.
- `DELETE /appointments/:id` cancels rather than deletes, and only a scheduled appointment can be cancelled. Once the patient has arrived it can only be completed.
- `PUT` changes purpose, notes and consultation notes only. Moving an appointment to another slot means cancelling and booking again.
- The Super Admin can do everything a receptionist can. Receptionists never see consultation notes.
- A patient can only be marked as arrived on the day of the appointment.
- The patient ID is `PT-` plus a number. Mobile numbers are not unique, since family members share them, and there is no merging of duplicate patients.
- Departments are seeded, not managed in the app. Doctors and receptionists get a password from the admin; there is no password reset or deactivation screen.
- Name search matches the start of any word of the name, not text in the middle of a word.

## Known limitations

- An access token is not re-checked against the database, so a deactivated user keeps access, and a signed-out user's access token keeps working, until it expires (at most 15 minutes). A live connection is closed when its token expires, and reconnects with a fresh one only while the session is still valid.
- A schedule change that would leave a future booking on a slot that is no longer offered is refused until those appointments are cancelled. There is no rescheduling, so the admin has to cancel them first. A booking made in the instant between that check and the save is not caught.
- Lists narrowed by doctor, department, status or patient may be sorted in memory over the filtered rows. This is fine for one clinic.
- Only login is rate limited, and the main JavaScript bundle (about 540 kB, mostly libraries) is not split further.
- The audit log is written but there is no screen or endpoint to read it.
- Filters are kept in the page address (so a list can be bookmarked), which means a patient's name or number can end up in the browser history. The app sends no `Referer` header to other sites, but anyone using the same browser profile can see the history.
- There is no "no-show" status: a patient who never arrives stays `SCHEDULED` until someone cancels it.

## Future improvements

- A screen for the audit log, user deactivation and password reset, and a forced password change on first login.
- Rescheduling, appointment reminders, and a waiting-list for busy slots.
- Cursor-based paging and indexes for the common filter and sort combinations, then a search service for patient names.
- A Redis adapter for Socket.IO and cached doctor schedules when running more than one API instance.
- Browser tests for the main flows, and a generated API reference (OpenAPI).

Scaling to millions of appointments is covered in ENGINEERING_DECISIONS.md.
