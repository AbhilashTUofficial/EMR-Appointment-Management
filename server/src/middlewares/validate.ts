import type { RequestHandler } from "express";
import type { ZodType } from "zod";

// Replaces the request data with the parsed value, so unknown fields are dropped and types are coerced.
export const validate =
  (schema: ZodType, source: "body" | "params" = "body"): RequestHandler =>
  (req, _res, next) => {
    req[source] = schema.parse(req[source]);
    next();
  };
