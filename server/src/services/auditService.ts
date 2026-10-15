import type { Types } from "mongoose";
import { AuditLog } from "../models/auditLog";
import type { AuthUser } from "../models/user";

type AuditEntry = {
  userId?: Types.ObjectId | string;
  role?: string;
  action: string;
  entityType?: string;
  entityId?: Types.ObjectId | string;
  metadata?: object;
};

// A failed audit write is logged but must never fail the request that triggered it.
export async function logAudit(entry: AuditEntry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error("Audit log write failed", err);
  }
}

// The common case: a signed-in user did something to one record.
export const auditAction = (user: AuthUser, action: string, entityType: string, entityId: Types.ObjectId | string) =>
  logAudit({ userId: user.id, role: user.role, action, entityType, entityId });
