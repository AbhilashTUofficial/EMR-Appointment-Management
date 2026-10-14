import type { Types } from "mongoose";
import { env } from "../config/env";
import { Appointment, type AppointmentDoc, type AppointmentStatus } from "../models/appointment";
import { Patient } from "../models/patient";
import { User, type Role } from "../models/user";
import { AppError } from "../utils/AppError";
import { publish } from "../realtime";
import { canTransition } from "../utils/appointmentStatus";
import { escapeRegex, isDuplicateKeyError } from "../utils/mongo";
import { clinicNow } from "../utils/time";
import type { CreateAppointmentInput, ListAppointmentsQuery, UpdateAppointmentInput } from "../validators/appointment";
import { logAudit } from "./auditService";
import { createPatient, deletePatient, getPatient, toPatient, type PatientFields } from "./patientService";
import { generateSchedule, hasPassed } from "./slotService";

type Viewer = { id: string; role: Role };
type Row = AppointmentDoc & { _id: Types.ObjectId };

const slotTaken = () => new AppError(409, "SLOT_ALREADY_BOOKED", "This slot has just been booked. Please pick another.");
const notFound = () => new AppError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found");

// A doctor only ever works with their own appointments; for them everyone else's simply don't exist.
const scopeTo = (viewer: Viewer) => (viewer.role === "DOCTOR" ? { doctorId: viewer.id } : {});

type Person = { _id: Types.ObjectId; name: string };

function toAppointment(a: Row, patient: PatientFields, doctor: Person, viewer: Viewer) {
  return {
    id: a._id,
    date: a.date,
    slotStart: a.slotStart,
    slotEnd: a.slotEnd,
    status: a.status,
    purpose: a.purpose,
    notes: a.notes,
    // Clinical notes are for doctors (and admins), not the front desk.
    ...(viewer.role !== "RECEPTIONIST" && { consultationNotes: a.consultationNotes }),
    patient: toPatient(patient),
    doctor: { id: doctor._id, name: doctor.name },
    departmentId: a.departmentId,
  };
}

// Adds the patient and doctor to a page of appointments with two lookups, however many rows there are.
async function withPeople(rows: Row[], viewer: Viewer) {
  const [patients, doctors] = await Promise.all([
    Patient.find({ _id: { $in: rows.map((r) => r.patientId) } }).lean(),
    User.find({ _id: { $in: rows.map((r) => r.doctorId) } }).select("name").lean(),
  ]);
  const patientById = new Map(patients.map((p) => [String(p._id), p]));
  const doctorById = new Map(doctors.map((d) => [String(d._id), d]));
  return rows.map((row) => toAppointment(row, patientById.get(String(row.patientId))!, doctorById.get(String(row.doctorId))!, viewer));
}

export async function createAppointment(input: CreateAppointmentInput, user: Viewer) {
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
  publish("appointment:created", appointment);
  return toAppointment(appointment, patient, doctor, user);
}

const sortKeys = { date: ["date", "slotStart"], createdAt: ["createdAt"], status: ["status", "date", "slotStart"] } as const;

export async function listAppointments(query: ListAppointmentsQuery, viewer: Viewer) {
  const filter: Record<string, unknown> = { ...scopeTo(viewer) };
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) filter.date = { ...(query.from && { $gte: query.from }), ...(query.to && { $lte: query.to }) };

  // Searching by patient or doctor first finds the matching ids (only when asked for), so listing stays one query.
  const patientFilters: object[] = [];
  if (query.patient) {
    patientFilters.push({ $or: [{ nameLower: { $regex: `^${escapeRegex(query.patient.toLowerCase())}` } }, { patientCode: query.patient.toUpperCase() }] });
  }
  if (query.mobile) patientFilters.push({ mobile: { $regex: `^${escapeRegex(query.mobile.replace(/[\s-]/g, ""))}` } });
  if (patientFilters.length) {
    const patients = await Patient.find({ $and: patientFilters }).select("_id").limit(1000).lean();
    filter.patientId = { $in: patients.map((p) => p._id) };
  }

  let doctorIds = viewer.role !== "DOCTOR" && query.doctorId ? [query.doctorId] : undefined;
  if (query.doctor && viewer.role !== "DOCTOR") {
    const found = await User.find({ role: "DOCTOR", name: { $regex: escapeRegex(query.doctor), $options: "i" } }).select("_id").lean();
    const foundIds = found.map((d) => String(d._id));
    doctorIds = doctorIds ? doctorIds.filter((id) => foundIds.includes(id)) : foundIds;
  }
  if (doctorIds) filter.doctorId = { $in: doctorIds };

  // The sort key is chosen from a fixed list, never taken from the request, and _id makes pages stable.
  const direction = query.order === "asc" ? 1 : -1;
  const sort: [string, 1 | -1][] = [...sortKeys[query.sortBy], "_id"].map((key) => [key, direction]);

  const [rows, total] = await Promise.all([
    Appointment.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Object.keys(filter).length ? Appointment.countDocuments(filter) : Appointment.estimatedDocumentCount(),
  ]);

  return {
    items: await withPeople(rows, viewer),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function getAppointment(id: string, viewer: Viewer) {
  const row = await Appointment.findOne({ _id: id, ...scopeTo(viewer) }).lean();
  if (!row) throw notFound();
  return (await withPeople([row], viewer))[0];
}

export async function updateAppointment(id: string, changes: UpdateAppointmentInput, viewer: Viewer) {
  // Front desk staff edit the booking details; the doctor adds clinical notes.
  const allowed = viewer.role === "DOCTOR" ? ["consultationNotes"] : ["purpose", "notes"];
  const refused = Object.keys(changes).filter((field) => !allowed.includes(field));
  if (refused.length) throw new AppError(403, "FORBIDDEN_FIELD", `You can't change: ${refused.join(", ")}`);

  const appointment = await Appointment.findOne({ _id: id, ...scopeTo(viewer) }).lean();
  if (!appointment) throw notFound();

  if (appointment.status === "CANCELLED") throw new AppError(409, "APPOINTMENT_LOCKED", "A cancelled appointment can't be edited");
  if (viewer.role === "DOCTOR" && appointment.status === "SCHEDULED") {
    throw new AppError(409, "APPOINTMENT_LOCKED", "Notes can be added once the patient has arrived");
  }
  if (viewer.role !== "DOCTOR" && appointment.status === "COMPLETED") {
    throw new AppError(409, "APPOINTMENT_LOCKED", "A completed appointment can't be edited");
  }

  // Conditional on the status just read, so notes can't land on an appointment that was cancelled in the meantime.
  const updated = await Appointment.findOneAndUpdate({ _id: id, status: appointment.status }, changes, { returnDocument: "after", runValidators: true }).lean();
  if (!updated) throw new AppError(409, "APPOINTMENT_LOCKED", "This appointment was just changed by someone else. Refresh and try again.");

  await logAudit({ userId: viewer.id, role: viewer.role, action: "APPOINTMENT_UPDATED", entityType: "Appointment", entityId: updated._id });
  publish("appointment:updated", updated);
  return (await withPeople([updated], viewer))[0];
}

const statusEffects = {
  ARRIVED: { action: "APPOINTMENT_ARRIVED", set: () => ({ arrivedAt: new Date() }) },
  COMPLETED: { action: "APPOINTMENT_COMPLETED", set: () => ({ completedAt: new Date() }) },
  // Cancelling releases the slot: the unique index only covers active appointments.
  CANCELLED: { action: "APPOINTMENT_CANCELLED", set: (viewer: Viewer) => ({ cancelledAt: new Date(), cancelledBy: viewer.id, isActive: false }) },
} as const;

export async function changeStatus(id: string, to: Exclude<AppointmentStatus, "SCHEDULED">, viewer: Viewer) {
  const appointment = await Appointment.findOne({ _id: id, ...scopeTo(viewer) }).lean();
  if (!appointment) throw notFound();

  const from = appointment.status as AppointmentStatus;
  if (!canTransition(from, to)) {
    throw new AppError(409, "INVALID_STATUS_TRANSITION", `A ${from.toLowerCase()} appointment can't be marked as ${to.toLowerCase()}`);
  }
  if (to === "ARRIVED" && appointment.date !== clinicNow(env.CLINIC_TIMEZONE).date) {
    throw new AppError(400, "NOT_TODAY", "A patient can only be marked as arrived on the day of the appointment");
  }

  // Conditional on the status just read, so two people acting on the same appointment can't both succeed.
  const effect = statusEffects[to];
  const updated = await Appointment.findOneAndUpdate({ _id: id, status: from }, { status: to, ...effect.set(viewer) }, { returnDocument: "after" }).lean();
  if (!updated) throw new AppError(409, "INVALID_STATUS_TRANSITION", "This appointment was just changed by someone else. Refresh and try again.");

  await logAudit({ userId: viewer.id, role: viewer.role, action: effect.action, entityType: "Appointment", entityId: updated._id });
  publish(to === "CANCELLED" ? "appointment:cancelled" : "appointment:updated", updated);
  return (await withPeople([updated], viewer))[0];
}
