import { z } from "zod";
import { APPOINTMENT_STATUSES } from "../models/appointment";
import { HHMM } from "../utils/patterns";
import { objectId } from "./common";
import { newPatientSchema } from "./patient";

export const createAppointmentSchema = z
  .object({
    doctorId: objectId,
    date: z.iso.date(),
    slotStart: z.string().regex(HHMM, "Use HH:mm"),
    purpose: z.string().trim().min(1, "Enter the purpose of the visit").max(500),
    notes: z.string().trim().max(1000).optional(),
    patientId: objectId.optional(), // an existing patient...
    newPatient: newPatientSchema.optional(), // ...or details for a new one
  })
  .refine((body) => !!body.patientId !== !!body.newPatient, {
    message: "Provide either patientId or newPatient",
    path: ["patientId"],
  });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

// Query values arrive as strings, so numbers are coerced and optional filters may be absent.
const text = z.string().trim().min(1).max(100).optional();

export const listAppointmentsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    sortBy: z.enum(["date", "createdAt", "status"]).default("date"),
    order: z.enum(["asc", "desc"]).default("desc"),
    patient: text, // patient name or patient ID
    mobile: text,
    doctor: text, // doctor name
    doctorId: objectId.optional(),
    departmentId: objectId.optional(),
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must not be after 'to'", path: ["to"] });

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsSchema>;

export const updateAppointmentSchema = z
  .object({
    purpose: z.string().trim().min(1, "Enter the purpose of the visit").max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    consultationNotes: z.string().trim().max(5000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
