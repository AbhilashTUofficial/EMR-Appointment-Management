# EMR Appointment Management

Appointment management module for an EMR system, built with the MERN stack and TypeScript.

Work in progress: this README grows as each part is built.

## Stack

- **Server:** Node.js, Express 5, MongoDB with Mongoose, Zod, JWT
- **Client:** React, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS (Vite)

## Folder structure

```
server/
  src/
    config/        env parsing
    middlewares/   error handling
    routes/        route definitions
    utils/         AppError, response helper
    app.ts         express app
    server.ts      entry point
  tests/
client/
  src/
    api/           fetch wrapper (token handling, refresh) and API calls
    auth/          auth context, route guard
    components/    shared UI: layout, form fields, button, spinner, staff form, slot grid, patient picker
    hooks/         shared data queries
    forms.ts       shows server validation errors on form fields
    pages/         one file per screen (admin screens in pages/admin)
    main.tsx  router.tsx
```

## Getting started

Requires Node 22 or newer (developed on Node 24).

```bash
npm install
cp server/.env.example server/.env
npm run dev -w server    # http://localhost:4000
npm run dev -w client    # http://localhost:5173 (proxies /api to the server)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run lint` | ESLint for both packages |
| `npm run typecheck` | `tsc --noEmit` for both packages |
| `npm test` | Server tests (Vitest, uses an in-memory MongoDB) |
| `npm run seed -w server` | Creates demo departments and users; safe to re-run |
| `npm run build` | Builds server and client |

## API response format

Every response uses the same envelope:

```json
{ "success": true, "message": "OK", "data": {}, "meta": {} }
{ "success": false, "message": "Invalid request", "code": "VALIDATION_ERROR", "errors": [{ "field": "email", "message": "…" }] }
```

All routes live under `/api/v1`.

## Authentication

The client signs in on `/login`. The session is restored on page reload from the refresh cookie, and signing out ends it on the server. Signed-out users are redirected to `/login`.

Users log in with email and password. Login returns a short-lived access token in the response body (15 minutes). The client keeps it in memory and sends it as `Authorization: Bearer <token>`. A refresh token (7 days) is set as an httpOnly cookie that is only sent to `/api/v1/auth/*`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` returns `{ user, accessToken }` and sets the refresh cookie. Limited to 10 attempts per 15 minutes per IP |
| POST | `/auth/refresh` | Uses the cookie. Returns a new `{ user, accessToken }` and a new refresh cookie; the old refresh token stops working |
| POST | `/auth/logout` | Deletes the refresh token and clears the cookie |

Errors: `400` invalid body, `401` wrong credentials or missing/invalid token, `403` role not allowed, `429` too many login attempts.

Roles are `SUPER_ADMIN`, `RECEPTIONIST` and `DOCTOR`. Routes are protected with the `authenticate` and `authorize(...roles)` middlewares.

## Doctors, schedules and receptionists

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/departments` | any signed-in user | Name and code of each department |
| GET | `/doctors` | admin, receptionist, doctor | Optional `?departmentId=`. A doctor only gets themselves |
| POST | `/doctors` | admin | `{ name, email, password, departmentId, specialization? }`. Creates a doctor with no working days yet |
| PUT | `/doctors/:id/schedule` | admin | `{ slotDurationMinutes, workingDays[] }`, replaces the whole schedule |
| POST | `/receptionists` | admin | `{ name, email, password }` |

A schedule is a list of working days (`day` 0 = Sunday to 6 = Saturday). Each day has named `sessions` and `breaks` as `HH:mm` ranges. The server rejects an end before a start, overlapping sessions, overlapping breaks, a day listed twice and slot lengths outside 5-120 minutes.

Admins manage this in the app under Doctors and Receptionists.

## Slots

`GET /slots?doctorId=&date=YYYY-MM-DD` (admin, receptionist, doctor for their own schedule). Both parameters are required.

Slots are worked out from the doctor's schedule each time and are not stored. The response is the day's sessions with their slots, plus the breaks:

```json
{
  "isWorkingDay": true,
  "sessions": [
    { "name": "Morning", "start": "09:00", "end": "12:00",
      "slots": [{ "start": "09:00", "end": "09:15", "status": "AVAILABLE" },
                { "start": "09:15", "end": "09:30", "status": "BOOKED", "appointmentId": "…" }] }
  ],
  "breaks": [{ "name": "Lunch Break", "start": "12:00", "end": "13:00" }]
}
```

A slot is `BOOKED` if an active appointment holds it, `PAST` if it has already started (or the date is before today), otherwise `AVAILABLE`. On a day the doctor doesn't work, `isWorkingDay` is false and the lists are empty. Errors: `400` bad or missing parameters, `404` unknown doctor (or another doctor's schedule when signed in as a doctor).

The scheduler screen shows this as a grid, with the filters (department, doctor, date) kept in the URL.

## Patients and booking

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/patients?search=` | admin, receptionist | Up to 10 matches by patient ID (`PT-000042`), start of a mobile number, or start of a name |
| POST | `/appointments` | admin, receptionist | Books a slot |

Booking body:

```json
{
  "doctorId": "…", "date": "2026-10-19", "slotStart": "10:00",
  "purpose": "Fever for three days", "notes": "optional",
  "patientId": "…"                       // an existing patient, or
  "newPatient": { "name": "Asha Nair", "mobile": "98765 43210", "gender": "FEMALE", "dateOfBirth": "1990-05-01" }
}
```

Send exactly one of `patientId` and `newPatient`. A new patient is registered with the next patient ID. The appointment is linked to the patient, the doctor, the doctor's department and the slot.

Errors: `400` for invalid input, a time that isn't one of the doctor's slots (`SLOT_NOT_AVAILABLE`, which covers breaks and times off the slot grid) or a slot in the past (`SLOT_IN_PAST`); `404` for an unknown doctor or patient; `409` `SLOT_ALREADY_BOOKED` when someone else got the slot first.

In the app, clicking an available slot in the scheduler opens the booking page, where the receptionist either searches for an existing patient or enters a new one.

Other: `GET /api/v1/health`.

## Environment variables

See `server/.env.example`.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 4000) |
| `CLIENT_ORIGIN` | Allowed CORS origin (default http://localhost:5173) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets, at least 32 characters each and different from each other |
| `CLINIC_TIMEZONE` | Timezone appointment dates and times are in (default Asia/Kolkata) |
| `SEED_PASSWORD` | Password for the accounts created by the seed script |

## Database

Seven collections. Dates are stored as `YYYY-MM-DD` strings and times as `HH:mm` strings in the clinic's local time, so there are no timezone conversions in the data.

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
| `patients` | Patient code (`PT-000042`), name, mobile, gender, date of birth |
| `appointments` | Patient, doctor, department, date, slot, status, purpose and notes |
| `refreshtokens` | Hashed refresh tokens, removed automatically after they expire |
| `auditlogs` | Who did what to which record, and when |
| `counters` | Sequence numbers (used for patient codes) |

Sample appointment:

```json
{
  "patientId": "664f…", "doctorId": "664e…", "departmentId": "664d…",
  "date": "2026-10-20", "slotStart": "09:15", "slotEnd": "09:30",
  "status": "SCHEDULED", "isActive": true,
  "purpose": "Fever for 3 days", "notes": ""
}
```

Index details and the reasoning behind them are in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

Seeded logins (all use `SEED_PASSWORD`): `admin@emr.test`, `reception@emr.test`, `anita.rao@emr.test`, `vikram.mehta@emr.test`, `sara.thomas@emr.test`.
