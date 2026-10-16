import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../server/src/app";
import { connectDb } from "../server/src/config/db";

// The API as a Vercel function: one Express app, with the database connection kept between requests
// on the same warm instance. (Live updates use polling on Vercel; see client/src/hooks/useRealtime.ts.)
let ready: Promise<void> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= connectDb().catch((err) => {
    ready = undefined; // try again on the next request instead of caching the failure
    throw err;
  });
  await ready;
  return app(req, res);
}
