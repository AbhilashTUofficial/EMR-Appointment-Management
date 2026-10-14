import type { RequestHandler } from "express";
import { unauthorized } from "../utils/AppError";
import { verifyAccessToken } from "../utils/jwt";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  req.user = verifyAccessToken(header.slice(7));
  next();
};
