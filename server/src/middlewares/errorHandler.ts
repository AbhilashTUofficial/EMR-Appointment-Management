import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

function fail(
  res: Parameters<RequestHandler>[1],
  status: number,
  code: string,
  message: string,
  errors?: unknown,
) {
  res.status(status).json({ success: false, message, code, ...(errors ? { errors } : {}) });
}

export const notFound: RequestHandler = (_req, res) => {
  fail(res, 404, "NOT_FOUND", "Route not found");
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.errors);
  }
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return fail(res, 400, "VALIDATION_ERROR", "Invalid request", errors);
  }
  // body-parser raises this for malformed JSON
  if (err?.type === "entity.parse.failed") {
    return fail(res, 400, "BAD_JSON", "Malformed JSON body");
  }

  // Never send internals to the client; log them here instead.
  console.error(err);
  fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
};
