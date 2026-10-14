import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { sendError } from "../utils/response";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => sendError(res, 429, "TOO_MANY_REQUESTS", "Too many login attempts. Try again later."),
});
