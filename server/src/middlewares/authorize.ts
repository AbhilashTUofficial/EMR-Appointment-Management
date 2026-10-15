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

// The role groups routes use.
export const adminOnly = authorize("SUPER_ADMIN");
export const frontDesk = authorize("SUPER_ADMIN", "RECEPTIONIST");
export const doctorOnly = authorize("DOCTOR");
export const anyStaff = authorize("SUPER_ADMIN", "RECEPTIONIST", "DOCTOR");
