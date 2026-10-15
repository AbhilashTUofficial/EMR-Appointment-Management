import { Schema, model, type InferSchemaType } from "mongoose";
import { HHMM } from "../utils/patterns";

export const ROLES = ["SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"] as const;
export type Role = (typeof ROLES)[number];

// The signed-in user, as read from their access token.
export type AuthUser = { id: string; role: Role };

const hhmm = { type: String, required: true, match: HHMM };

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

const isDoctor = function (this: { role: string }) {
  return this.role === "DOCTOR";
};

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isActive: { type: Boolean, default: true },
    doctorProfile: {
      type: doctorProfile,
      required: [isDoctor, "Doctors need a profile"],
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, "doctorProfile.departmentId": 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
