import bcrypt from "bcrypt";
import { mongo } from "mongoose";
import { BCRYPT_ROUNDS } from "../config/security";
import { User } from "../models/user";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

type NewStaff = { name: string; email: string; password: string; role: "RECEPTIONIST" | "DOCTOR"; doctorProfile?: object };

// Creates a receptionist or doctor on behalf of an admin.
export async function createStaff({ password, ...fields }: NewStaff, adminId: string) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    user = await User.create({ ...fields, passwordHash });
  } catch (err) {
    if (err instanceof mongo.MongoServerError && err.code === 11000) throw new AppError(409, "EMAIL_TAKEN", "A user with this email already exists");
    throw err;
  }

  await logAudit({
    userId: adminId,
    role: "SUPER_ADMIN",
    action: "USER_CREATED",
    entityType: "User",
    entityId: user._id,
    metadata: { role: user.role },
  });
  return user;
}
