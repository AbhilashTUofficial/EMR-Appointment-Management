import type { Types } from "mongoose";
import { env } from "../config/env";
import { Appointment } from "../models/appointment";
import { Department } from "../models/department";
import { User, type AuthUser, type UserDoc } from "../models/user";
import { AppError } from "../utils/AppError";
import { clinicNow } from "../utils/time";
import type { ScheduleInput } from "../validators/doctor";
import { publishScheduleChange } from "../realtime";
import { auditAction } from "./auditService";
import { generateSchedule, hasPassed } from "./slotService";
import { createStaff } from "./userService";

type DoctorUser = { _id: Types.ObjectId } & Pick<UserDoc, "name" | "email" | "isActive" | "doctorProfile">;

const toDoctor = (user: DoctorUser) => {
  const profile = user.doctorProfile!;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    departmentId: profile.departmentId,
    specialization: profile.specialization,
    slotDurationMinutes: profile.slotDurationMinutes,
    workingDays: profile.workingDays,
  };
};

// Doctors only ever see themselves.
export async function listDoctors(viewer: AuthUser, departmentId?: string) {
  const filter = viewer.role === "DOCTOR" ? { _id: viewer.id } : departmentId ? { "doctorProfile.departmentId": departmentId } : {};
  const doctors = await User.find({ role: "DOCTOR", isActive: true, ...filter }).sort("name").lean();
  return doctors.map(toDoctor);
}

export async function createDoctor(
  input: { name: string; email: string; password: string; departmentId: string; specialization?: string },
  admin: AuthUser,
) {
  if (!(await Department.exists({ _id: input.departmentId }))) throw new AppError(404, "DEPARTMENT_NOT_FOUND", "Department not found");

  const { departmentId, specialization, ...fields } = input;
  // A new doctor has no working days yet; the schedule is set separately.
  const doctor = await createStaff(
    { ...fields, role: "DOCTOR", doctorProfile: { departmentId, specialization, workingDays: [] } },
    admin,
  );
  return toDoctor(doctor);
}

// Upcoming appointments that the new schedule would no longer offer (a different slot length, a removed day or session, a new break).
async function strandedBookings(doctorId: string, schedule: ScheduleInput) {
  const now = clinicNow(env.CLINIC_TIMEZONE);
  const upcoming = await Appointment.find({ doctorId, isActive: true, date: { $gte: now.date } }).select("date slotStart slotEnd").lean();
  return upcoming
    .filter((a) => !hasPassed(a.date, a.slotStart, now))
    .filter((a) => !generateSchedule(schedule, a.date).sessions.some((s) => s.slots.some((slot) => slot.start === a.slotStart && slot.end === a.slotEnd)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slotStart.localeCompare(b.slotStart));
}

export async function updateSchedule(doctorId: string, schedule: ScheduleInput, admin: AuthUser) {
  if (!(await User.exists({ _id: doctorId, role: "DOCTOR" }))) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  // Booked patients must not be left holding a slot the doctor no longer offers.
  const stranded = await strandedBookings(doctorId, schedule);
  if (stranded.length) {
    const first = stranded[0];
    throw new AppError(
      409,
      "SCHEDULE_CONFLICT",
      `This change would leave ${stranded.length} booked appointment${stranded.length === 1 ? "" : "s"} outside the schedule, the first on ${first.date} at ${first.slotStart}. Cancel or move them first.`,
    );
  }

  const doctor = await User.findOneAndUpdate(
    { _id: doctorId, role: "DOCTOR" },
    { $set: { "doctorProfile.slotDurationMinutes": schedule.slotDurationMinutes, "doctorProfile.workingDays": schedule.workingDays } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  await auditAction(admin, "SCHEDULE_UPDATED", "User", doctor._id);
  publishScheduleChange(doctor._id);
  return toDoctor(doctor);
}
