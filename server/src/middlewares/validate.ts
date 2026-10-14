import type { RequestHandler } from "express";
import type { ZodType } from "zod";

// Replaces the body with the parsed value, so unknown fields are dropped and types are coerced.
export const validate =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
