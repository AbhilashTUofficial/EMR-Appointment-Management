import type { Types } from "mongoose";
import { Counter } from "../models/counter";
import { Patient } from "../models/patient";
import type { Role } from "../models/user";
import { AppError } from "../utils/AppError";
import { escapeRegex } from "../utils/mongo";
import type { NewPatientInput } from "../validators/patient";
import { logAudit } from "./auditService";

export type PatientFields = {
  _id: Types.ObjectId;
  patientCode: string;
  name: string;
  mobile: string;
  gender: string;
  dateOfBirth?: Date | null;
};

export const toPatient = (p: PatientFields) => ({
  id: p._id,
  patientCode: p.patientCode,
  name: p.name,
  mobile: p.mobile,
  gender: p.gender,
  dateOfBirth: p.dateOfBirth,
});

// Matches a patient whose patient ID is the term, or in whose name every word of the term starts a word.
// "das" finds "Rohan Das" and "rohan d" does too. The indexed word list keeps this an index lookup.
export const nameOrCodeFilter = (term: string) => ({
  $or: [
    { $and: term.toLowerCase().split(/\s+/).filter(Boolean).map((word) => ({ nameTokens: { $regex: `^${escapeRegex(word)}` } })) },
    { patientCode: term.toUpperCase() },
  ],
});

// Matches the start of a mobile number, written with or without its country code, spaces or dashes.
export const mobileFilter = (term: string) => {
  const digits = term.replace(/\D/g, "");
  if (!digits) return { mobileDigits: null }; // nothing to match on, so nothing matches
  const startsWith = { $regex: `^${digits}` };
  return { $or: [{ mobileDigits: startsWith }, { mobileLocal: startsWith }] };
};

export async function searchPatients(term: string) {
  const conditions: object[] = [nameOrCodeFilter(term)];
  if (/^\+?[\d\s-]+$/.test(term)) conditions.push(mobileFilter(term));

  const patients = await Patient.find({ $or: conditions }).sort("nameLower").limit(10).lean();
  return patients.map(toPatient);
}

export async function createPatient(input: NewPatientInput, actor: { id: string; role: Role }) {
  // Atomic counter, so two patients registered at once never get the same code.
  const counter = await Counter.findOneAndUpdate({ _id: "patient" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  const patient = await Patient.create({ ...input, patientCode: `PT-${String(counter.seq).padStart(6, "0")}`, createdBy: actor.id });

  await logAudit({ userId: actor.id, role: actor.role, action: "PATIENT_CREATED", entityType: "Patient", entityId: patient._id });
  return patient;
}

export const deletePatient = (id: Types.ObjectId) => Patient.deleteOne({ _id: id });

export async function getPatient(id: string) {
  const patient = await Patient.findById(id);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found");
  return patient;
}
