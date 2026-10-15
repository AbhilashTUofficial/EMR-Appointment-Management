import { Types } from "mongoose";
import { env } from "../config/env";
import { Appointment, APPOINTMENT_STATUSES } from "../models/appointment";
import { Patient } from "../models/patient";
import { User, type AuthUser } from "../models/user";
import { clinicNow } from "../utils/time";

// Today's appointments by status (a doctor's own only), plus overall totals for the admin.
export async function getSummary(viewer: AuthUser) {
  const date = clinicNow(env.CLINIC_TIMEZONE).date;
  const match = viewer.role === "DOCTOR" ? { date, doctorId: new Types.ObjectId(viewer.id) } : { date };

  const grouped = await Appointment.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
  const counts = Object.fromEntries(APPOINTMENT_STATUSES.map((status) => [status, grouped.find((g) => g._id === status)?.count ?? 0]));

  if (viewer.role !== "SUPER_ADMIN") return { date, counts };
  const [doctors, patients] = await Promise.all([User.countDocuments({ role: "DOCTOR", isActive: true }), Patient.estimatedDocumentCount()]);
  return { date, counts, totals: { doctors, patients } };
}
