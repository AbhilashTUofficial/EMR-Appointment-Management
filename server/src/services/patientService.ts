import type { Types } from "mongoose";
import { Counter } from "../models/counter";
import { Patient } from "../models/patient";
import type { AuthUser } from "../models/user";
import { AppError } from "../utils/AppError";
import { escapeRegex, isDuplicateKeyError } from "../utils/mongo";
import { nameWords } from "../utils/names";
import type { NewPatientInput } from "../validators/patient";
import { auditAction } from "./auditService";

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
export const nameOrCodeFilter = (term: string) => {
  const byCode = { patientCode: term.toUpperCase() };
  const words = nameWords(term);
  if (!words.length) return byCode; // only punctuation, so there is no name to match
  return { $or: [{ $and: words.map((word) => ({ nameTokens: { $regex: `^${escapeRegex(word)}` } })) }, byCode] };
};

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

// Atomic counter, so two patients registered at once never get the same code.
async function nextPatientCode() {
  const bump = () => Counter.findOneAndUpdate({ _id: "patient" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  let counter;
  try {
    counter = await bump();
  } catch (err) {
    // The very first two patients can both try to create the counter; the loser simply increments it.
    if (!isDuplicateKeyError(err)) throw err;
    counter = await bump();
  }
  return `PT-${String(counter.seq).padStart(6, "0")}`;
}

export async function createPatient(input: NewPatientInput, actor: AuthUser) {
  const patient = await Patient.create({ ...input, patientCode: await nextPatientCode(), createdBy: actor.id });
  await auditAction(actor, "PATIENT_CREATED", "Patient", patient._id);
  return patient;
}

export const deletePatient = (id: Types.ObjectId) => Patient.deleteOne({ _id: id });

export async function getPatient(id: string) {
  const patient = await Patient.findById(id);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found");
  return patient;
}
