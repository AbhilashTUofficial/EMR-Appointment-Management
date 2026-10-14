import { Schema, model, type InferSchemaType } from "mongoose";

export const ROLES = ["SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"] as const;

const hhmm = { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

// Used for both sessions and breaks: a named "HH:mm" range.
const timeRange = new Schema({ name: String, start: hhmm, end: hhmm }, { _id: false });

const workingDay = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    sessions: [timeRange],
    breaks: [timeRange],
  },
  { _id: false },
);

const doctorProfile = new Schema(
  {
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    specialization: String,
    slotDurationMinutes: { type: Number, min: 5, max: 120, default: 15 },
    workingDays: [workingDay],
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isActive: { type: Boolean, default: true },
    doctorProfile: {
      type: doctorProfile,
      required: [function (this: { role: string }) { return this.role === "DOCTOR"; }, "Doctors need a profile"],
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, "doctorProfile.departmentId": 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
