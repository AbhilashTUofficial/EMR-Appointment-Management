import type { RequestHandler, Response } from "express";
import type { ZodType } from "zod";

// Replaces the request data with the parsed value, so unknown fields are dropped and types are coerced.
// Express 5 does not allow req.query to be replaced, so the parsed query goes to res.locals; read it with parsedQuery.
export const validate =
  (schema: ZodType, source: "body" | "params" | "query" = "body"): RequestHandler =>
  (req, res, next) => {
    if (source === "query") res.locals.query = schema.parse(req.query);
    else req[source] = schema.parse(req[source]);
    next();
  };

export const parsedQuery = <T>(res: Response) => res.locals.query as T;
