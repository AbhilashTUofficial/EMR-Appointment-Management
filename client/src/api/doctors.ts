import { http } from "./http";

export type TimeRange = { name: string; start: string; end: string };
export type WorkingDay = { day: number; sessions: TimeRange[]; breaks: TimeRange[] };
export type Schedule = { slotDurationMinutes: number; workingDays: WorkingDay[] };
export type Doctor = Schedule & {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  specialization?: string;
};
type NewDoctor = { name: string; email: string; password: string; departmentId: string; specialization?: string };

export const getDoctors = async (departmentId?: string) =>
  (await http<Doctor[]>(`/doctors${departmentId ? `?${new URLSearchParams({ departmentId })}` : ""}`)).data;

export const createDoctor = async (doctor: NewDoctor) =>
  (await http<Doctor>("/doctors", { method: "POST", body: JSON.stringify(doctor) })).data;

export const updateSchedule = async (doctorId: string, schedule: Schedule) =>
  (await http<Doctor>(`/doctors/${doctorId}/schedule`, { method: "PUT", body: JSON.stringify(schedule) })).data;
