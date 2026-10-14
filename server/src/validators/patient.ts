import { z } from "zod";

export const newPatientSchema = z.object({
  name: z.string().trim().min(2, "Enter the patient's name").max(100),
  mobile: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter a valid mobile number")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.iso.date().optional(),
});

export type NewPatientInput = z.infer<typeof newPatientSchema>;

export const patientSearchSchema = z.object({ search: z.string().trim().min(1).max(100) });
