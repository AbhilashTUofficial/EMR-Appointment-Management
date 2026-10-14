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

More folders (models, services, controllers, validators) are added with the features that need them.

## Getting started

Requires Node 22+ (developed on Node 24).

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
| `npm test` | Server tests (Vitest) |
| `npm run build` | Builds server and client |

## API response format

Every response uses the same envelope:

```json
{ "success": true, "message": "OK", "data": {}, "meta": {} }
{ "success": false, "message": "Invalid request", "code": "VALIDATION_ERROR", "errors": [{ "field": "email", "message": "…" }] }
```

All routes live under `/api/v1`. Currently: `GET /api/v1/health`.
