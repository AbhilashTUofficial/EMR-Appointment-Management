import bcrypt from "bcrypt";
import { BCRYPT_ROUNDS } from "../config/security";
import { User, type AuthUser } from "../models/user";
import { AppError } from "../utils/AppError";
import { isDuplicateKeyError } from "../utils/mongo";
import { logAudit } from "./auditService";

type NewStaff = { name: string; email: string; password: string; role: "RECEPTIONIST" | "DOCTOR"; doctorProfile?: object };

// Creates a receptionist or doctor on behalf of an admin.
export async function createStaff({ password, ...fields }: NewStaff, admin: AuthUser) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    user = await User.create({ ...fields, passwordHash });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, "EMAIL_TAKEN", "A user with this email already exists");
    throw err;
  }

  await logAudit({ userId: admin.id, role: admin.role, action: "USER_CREATED", entityType: "User", entityId: user._id, metadata: { role: user.role } });
  return user;
}
