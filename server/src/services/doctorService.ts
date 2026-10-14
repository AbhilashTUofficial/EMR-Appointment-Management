import type { Types } from "mongoose";
import { Department } from "../models/department";
import { User, type UserDoc } from "../models/user";
import { AppError } from "../utils/AppError";
import type { ScheduleInput } from "../validators/doctor";
import { logAudit } from "./auditService";
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
export async function listDoctors(viewer: { id: string; role: string }, departmentId?: string) {
  const filter = viewer.role === "DOCTOR" ? { _id: viewer.id } : departmentId ? { "doctorProfile.departmentId": departmentId } : {};
  const doctors = await User.find({ role: "DOCTOR", ...filter }).sort("name").lean();
  return doctors.map(toDoctor);
}

export async function createDoctor(
  input: { name: string; email: string; password: string; departmentId: string; specialization?: string },
  adminId: string,
) {
  if (!(await Department.exists({ _id: input.departmentId }))) throw new AppError(404, "DEPARTMENT_NOT_FOUND", "Department not found");

  const { departmentId, specialization, ...fields } = input;
  // A new doctor has no working days yet; the schedule is set separately.
  const doctor = await createStaff(
    { ...fields, role: "DOCTOR", doctorProfile: { departmentId, specialization, slotDurationMinutes: 15, workingDays: [] } },
    adminId,
  );
  return toDoctor(doctor);
}

export async function updateSchedule(doctorId: string, schedule: ScheduleInput, adminId: string) {
  const doctor = await User.findOneAndUpdate(
    { _id: doctorId, role: "DOCTOR" },
    { $set: { "doctorProfile.slotDurationMinutes": schedule.slotDurationMinutes, "doctorProfile.workingDays": schedule.workingDays } },
    { new: true, runValidators: true },
  ).lean();
  if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  await logAudit({ userId: adminId, role: "SUPER_ADMIN", action: "SCHEDULE_UPDATED", entityType: "User", entityId: doctor._id });
  return toDoctor(doctor);
}
