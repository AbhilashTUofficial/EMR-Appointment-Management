import jwt, { type JwtPayload } from "jsonwebtoken";
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
