import type { RequestHandler } from "express";
import { env } from "../config/env";
import { ROLES } from "../models/user";
import { unauthorized } from "../utils/AppError";
import { verifyToken } from "../utils/jwt";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  const payload = verifyToken(header.slice(7), env.JWT_ACCESS_SECRET);
  if (!payload.sub || !ROLES.includes(payload.role)) throw unauthorized();

  req.user = { id: payload.sub, role: payload.role };
  next();
};
