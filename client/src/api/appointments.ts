import { http } from "./http";
import type { Patient } from "./patients";

export type NewPatient = { name: string; mobile: string; gender: string; dateOfBirth?: string };

export type NewAppointment = {
  doctorId: string;
  date: string;
  slotStart: string;
  purpose: string;
  notes?: string;
  patientId?: string;
  newPatient?: NewPatient;
};

export type Appointment = {
  id: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  purpose: string;
  patient: Patient;
  doctor: { id: string; name: string };
};

export const createAppointment = async (appointment: NewAppointment) =>
  (await http<Appointment>("/appointments", { method: "POST", body: JSON.stringify(appointment) })).data;
