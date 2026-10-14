# EMR Appointment Management

Appointment management module for an EMR system, built with the MERN stack and TypeScript.

Work in progress: this README grows as each part is built.

## Stack

- **Server:** Node.js, Express 5, MongoDB with Mongoose, Zod
- **Client:** React, React Router, TanStack Query, Tailwind CSS (Vite)

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
    api/           fetch wrapper
    pages/
    main.tsx  router.tsx
```

More folders (services, controllers, validators) are added with the features that need them.

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

All routes live under `/api/v1`. Currently: `GET /api/v1/health`.

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
