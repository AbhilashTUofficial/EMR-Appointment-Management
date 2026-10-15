import { http } from "./http";
import type { Patient } from "./patients";

type NewPatient = { name: string; mobile: string; gender: string; dateOfBirth?: string };

export type NewAppointment = {
  doctorId: string;
  date: string;
  slotStart: string;
  purpose: string;
  notes?: string;
  patientId?: string;
  newPatient?: NewPatient;
};

export type Status = "SCHEDULED" | "ARRIVED" | "COMPLETED" | "CANCELLED";

export type Appointment = {
  id: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  status: Status;
  purpose: string;
  notes?: string;
  consultationNotes?: string; // not sent to receptionists
  patient: Patient;
  doctor: { id: string; name: string };
  departmentId: string;
};

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
type Changes = { purpose?: string; notes?: string; consultationNotes?: string };

export const createAppointment = async (appointment: NewAppointment) =>
  (await http<Appointment>("/appointments", { method: "POST", body: JSON.stringify(appointment) })).data;

export async function listAppointments(query: string) {
  const response = await http<Appointment[]>(`/appointments?${query}`);
  return { items: response.data, meta: response.meta as PageMeta };
}

export const updateAppointment = async (id: string, changes: Changes) =>
  (await http<Appointment>(`/appointments/${id}`, { method: "PUT", body: JSON.stringify(changes) })).data;

export const cancelAppointment = async (id: string) => (await http<Appointment>(`/appointments/${id}`, { method: "DELETE" })).data;
export const arriveAppointment = async (id: string) => (await http<Appointment>(`/appointments/${id}/arrive`, { method: "POST" })).data;
export const completeAppointment = async (id: string) => (await http<Appointment>(`/appointments/${id}/complete`, { method: "POST" })).data;

type Summary = {
  date: string;
  counts: Record<Status, number>;
  totals?: { doctors: number; patients: number }; // admin only
};

export const getSummary = async () => (await http<Summary>("/dashboard/summary")).data;
