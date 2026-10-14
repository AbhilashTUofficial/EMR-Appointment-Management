import type { Response } from "express";

export function sendSuccess(
  res: Response,
  data: unknown,
  message = "OK",
  status = 200,
  meta: object = {},
) {
  res.status(status).json({ success: true, message, data, meta });
}
