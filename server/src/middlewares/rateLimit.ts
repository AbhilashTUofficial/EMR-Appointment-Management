import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type RateLimitInfo } from "express-rate-limit";
import { env } from "../config/env";
import { sendError } from "../utils/response";

const tooMany = (req: Request, res: Parameters<typeof sendError>[0]) => {
  const { resetTime } = (req as Request & { rateLimit: RateLimitInfo }).rateLimit;
  const msLeft = (resetTime?.getTime() ?? Date.now()) - Date.now();
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
  sendError(res, 429, "TOO_MANY_REQUESTS", `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
};

const shared = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count
  skip: () => env.NODE_ENV === "test",
  handler: tooMany,
};

// Failed attempts are counted per email from one address, so someone guessing one account's password
// is stopped without locking out colleagues who share the office network...
const perAccount = rateLimit({
  ...shared,
  limit: 10,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${String(req.body?.email ?? "").toLowerCase()}`,
});

// ...and per address overall, which stops one machine from trying many accounts.
const perAddress = rateLimit({ ...shared, limit: 50 });

export const loginLimiter = [perAddress, perAccount];
