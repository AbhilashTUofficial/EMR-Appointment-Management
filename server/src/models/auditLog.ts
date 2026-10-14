import { Schema, model } from "mongoose";

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" }, // empty for failed logins
    role: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: Schema.Types.ObjectId,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const AuditLog = model("AuditLog", auditLogSchema);
