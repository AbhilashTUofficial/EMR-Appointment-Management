import type { Response } from "express";
import type { FieldError } from "./AppError";

export function sendSuccess(res: Response, data: unknown, message = "OK", status = 200, meta = {}) {
  res.status(status).json({ success: true, message, data, meta });
}

export function sendError(res: Response, status: number, code: string, message: string, errors?: FieldError[]) {
  res.status(status).json({ success: false, message, code, errors });
}
