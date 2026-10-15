import { Schema, model, type InferSchemaType } from "mongoose";
import { HHMM, ISO_DATE } from "../utils/patterns";

export const APPOINTMENT_STATUSES = ["SCHEDULED", "ARRIVED", "COMPLETED", "CANCELLED"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

const appointmentSchema = new Schema(
  {
    patientId: ref("Patient"),
    doctorId: ref("User"),
    departmentId: ref("Department"), // copied from the doctor at booking so list filters need no join
    date: { type: String, required: true, match: ISO_DATE }, // clinic-local YYYY-MM-DD
    slotStart: { type: String, required: true, match: HHMM },
    slotEnd: { type: String, required: true, match: HHMM },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: "SCHEDULED" },
    isActive: { type: Boolean, default: true }, // true while the appointment holds its slot
    purpose: { type: String, trim: true },
    notes: { type: String, trim: true },
    consultationNotes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    arrivedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Double-booking guard. Only active appointments hold a slot, so cancelling frees it.
// This index also serves the "bookings for a doctor on a date" lookup.
appointmentSchema.index(
  { doctorId: 1, date: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
appointmentSchema.index({ doctorId: 1, date: 1, status: 1 }); // doctor's own list, status filters
appointmentSchema.index({ date: 1, slotStart: 1, _id: 1 }); // date-range list; matches the default sort, so it needs no in-memory sorting
appointmentSchema.index({ status: 1, date: 1, slotStart: 1, _id: 1 }); // the list sorted by status
appointmentSchema.index({ createdAt: 1, _id: 1 }); // the list sorted by when it was booked (either direction)
appointmentSchema.index({ departmentId: 1, date: 1 });
appointmentSchema.index({ patientId: 1, date: -1 });

export type AppointmentDoc = InferSchemaType<typeof appointmentSchema>;
export const Appointment = model("Appointment", appointmentSchema);
