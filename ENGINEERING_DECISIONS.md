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
