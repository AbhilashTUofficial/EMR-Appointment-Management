import { env } from "../config/env";
import { Appointment } from "../models/appointment";
import { User, type Role } from "../models/user";
import { AppError } from "../utils/AppError";
import { isDuplicateKeyError } from "../utils/mongo";
import { clinicNow } from "../utils/time";
import type { CreateAppointmentInput } from "../validators/appointment";
import { logAudit } from "./auditService";
import { createPatient, deletePatient, getPatient, toPatient } from "./patientService";
import { generateSchedule, hasPassed } from "./slotService";

const slotTaken = () => new AppError(409, "SLOT_ALREADY_BOOKED", "This slot has just been booked. Please pick another.");

export async function createAppointment(input: CreateAppointmentInput, user: { id: string; role: Role }) {
  const doctor = await User.findOne({ _id: input.doctorId, role: "DOCTOR", isActive: true }).lean();
  if (!doctor?.doctorProfile) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  // The client only names a start time; the slot itself must be one the schedule actually offers.
  const slot = generateSchedule(doctor.doctorProfile, input.date)
    .sessions.flatMap((session) => session.slots)
    .find((candidate) => candidate.start === input.slotStart);
  if (!slot) throw new AppError(400, "SLOT_NOT_AVAILABLE", "That time is not an available slot for this doctor");
  if (hasPassed(input.date, slot.start, clinicNow(env.CLINIC_TIMEZONE))) {
    throw new AppError(400, "SLOT_IN_PAST", "That slot is in the past");
  }

  // The unique index is the final concurrency guard; this check only lets most late requests
  // fail early, before a patient record is created for them.
  const holdsSlot = { doctorId: input.doctorId, date: input.date, slotStart: slot.start, isActive: true };
  if (await Appointment.exists(holdsSlot)) throw slotTaken();

  // The request schema guarantees exactly one of newPatient and patientId.
  const created = input.newPatient ? await createPatient(input.newPatient, user) : undefined;
  const patient = created ?? (await getPatient(input.patientId!));

  let appointment;
  try {
    appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      departmentId: doctor.doctorProfile.departmentId,
      date: input.date,
      slotStart: slot.start,
      slotEnd: slot.end,
      purpose: input.purpose,
      notes: input.notes,
      createdBy: user.id,
    });
  } catch (err) {
    // Lost the race for the slot: don't leave behind the patient this request just created.
    if (created) await deletePatient(created._id);
    throw isDuplicateKeyError(err, "slotStart") ? slotTaken() : err;
  }

  await logAudit({ userId: user.id, role: user.role, action: "APPOINTMENT_CREATED", entityType: "Appointment", entityId: appointment._id });

  return {
    id: appointment._id,
    date: appointment.date,
    slotStart: appointment.slotStart,
    slotEnd: appointment.slotEnd,
    status: appointment.status,
    purpose: appointment.purpose,
    notes: appointment.notes,
    patient: toPatient(patient),
    doctor: { id: doctor._id, name: doctor.name },
    departmentId: appointment.departmentId,
  };
}
