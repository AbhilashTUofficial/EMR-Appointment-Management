import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { ROLES, type AuthUser } from "../models/user";
import { unauthorized } from "./AppError";

// Throws a 401 for anything that isn't a valid token signed with this secret.
export function verifyToken(token: string, secret: string): JwtPayload {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "string") throw unauthorized();
    return payload;
  } catch {
    throw unauthorized();
  }
}

// The user behind an access token, for both the API and the live connection. Throws a 401 for anything else.
export function verifyAccessToken(token: unknown): AuthUser & { exp?: number } {
  const payload = verifyToken(String(token), env.JWT_ACCESS_SECRET);
  if (!payload.sub || !ROLES.includes(payload.role)) throw unauthorized();
  return { id: payload.sub, role: payload.role, exp: payload.exp };
}
