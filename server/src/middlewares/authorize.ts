import type { RequestHandler } from "express";
import type { Role } from "../models/user";
import { AppError } from "../utils/AppError";

// Use after `authenticate`.
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, "FORBIDDEN", "You do not have access to this resource");
    next();
  };
