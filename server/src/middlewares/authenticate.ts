import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  if (typeof payload === "string") throw new AppError(401, "UNAUTHORIZED", "Authentication required");

  req.user = { id: payload.sub!, role: payload.role };
  next();
};
