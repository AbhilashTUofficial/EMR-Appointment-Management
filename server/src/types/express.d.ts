import type { AuthUser } from "../models/user";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
