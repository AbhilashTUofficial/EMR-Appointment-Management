import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { sendError } from "../utils/response";

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Route not found");
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.errors);
  }
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid request", errors);
  }
  // Client mistakes raised by Express itself (malformed JSON -> 400, body too large -> 413).
  if (err?.status >= 400 && err.status < 500) {
    return sendError(res, err.status, "BAD_REQUEST", err.status === 413 ? "Request body too large" : "Malformed request");
  }

  // Never send internals to the client; log them here instead.
  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
};
