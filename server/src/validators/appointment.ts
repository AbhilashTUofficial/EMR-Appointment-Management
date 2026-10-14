import { z } from "zod";
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
