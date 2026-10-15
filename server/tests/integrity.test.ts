import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Appointment } from "../src/models/appointment";
import { AuditLog } from "../src/models/auditLog";
import { Counter } from "../src/models/counter";
import { Patient } from "../src/models/patient";
import { User } from "../src/models/user";
import { updateAppointment } from "../src/services/appointmentService";
import { mobileFilter, nameOrCodeFilter } from "../src/services/patientService";
import { FUTURE, as, useTestDb } from "./helpers";

useTestDb();

const PAST = "2000-03-06";

const admin = as("SUPER_ADMIN");
const receptionist = as("RECEPTIONIST");

const everyDay = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, sessions: [{ name: "Day", start: "09:00", end: "17:00" }], breaks: [] }));
const scheduleWith = (workingDays: unknown[], slotDurationMinutes = 15) => ({ slotDurationMinutes, workingDays });

let drA: string;
let drB: string;
let departmentId: Types.ObjectId;

const makeDoctor = async (name: string, email: string) =>
  String((await User.create({ name, email, passwordHash: "x", role: "DOCTOR", doctorProfile: { departmentId, slotDurationMinutes: 15, workingDays: everyDay } }))._id);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Appointment.deleteMany({}), Patient.deleteMany({}), Counter.deleteMany({}), AuditLog.deleteMany({})]);
  departmentId = new Types.ObjectId();
  drA = await makeDoctor("Dr. A", "a@emr.test");
  drB = await makeDoctor("Dr. B", "b@emr.test");
});

const newPatient = (overrides = {}) => ({ name: "Asha Nair", mobile: "9876543210", gender: "FEMALE", ...overrides });
const bookRequest = (overrides: Record<string, unknown> = {}) => ({ doctorId: drA, date: FUTURE, slotStart: "09:00", purpose: "Check-up", newPatient: newPatient(), ...overrides });
const book = (overrides: Record<string, unknown> = {}) => receptionist.post("/api/v1/appointments").send(bookRequest(overrides));
const insertAppointment = (overrides: Record<string, unknown> = {}) =>
  Appointment.create({ patientId: new Types.ObjectId(), doctorId: drA, departmentId, date: FUTURE, slotStart: "09:00", slotEnd: "09:15", purpose: "Check-up", ...overrides });

describe("editing a doctor's schedule that has bookings", () => {
  const putSchedule = (body: object) => admin.put(`/api/v1/doctors/${drA}/schedule`).send(body);
  const weekdayOfBooking = new Date(`${FUTURE}T00:00:00Z`).getUTCDay();

  beforeEach(async () => {
    await insertAppointment();
  });

  it("refuses a slot length that would no longer line up with a booked slot, and keeps the old schedule", async () => {
    const res = await putSchedule(scheduleWith(everyDay, 20));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_CONFLICT");
    expect(res.body.message).toContain(`${FUTURE} at 09:00`);
    expect((await User.findById(drA))!.doctorProfile!.slotDurationMinutes).toBe(15);
  });

  it("refuses to remove a working day, or add a break, over a booked slot", async () => {
    const withoutThatDay = everyDay.filter((d) => d.day !== weekdayOfBooking);
    expect((await putSchedule(scheduleWith(withoutThatDay))).body.code).toBe("SCHEDULE_CONFLICT");

    const withBreak = everyDay.map((d) => ({ ...d, breaks: [{ name: "Tea", start: "08:45", end: "09:05" }] }));
    expect((await putSchedule(scheduleWith(withBreak))).body.code).toBe("SCHEDULE_CONFLICT");
  });

  it("allows changes that leave every booking in place", async () => {
    const longer = everyDay.map((d) => ({ ...d, sessions: [{ name: "Day", start: "09:00", end: "18:00" }] }));
    expect((await putSchedule(scheduleWith(longer))).status).toBe(200);
  });

  it("ignores cancelled and past appointments", async () => {
    await Appointment.deleteMany({});
    await insertAppointment({ status: "CANCELLED", isActive: false });
    await insertAppointment({ date: PAST, slotStart: "09:05", slotEnd: "09:20" });
    expect((await putSchedule(scheduleWith(everyDay, 20))).status).toBe(200);
  });

  it("only looks at the doctor being edited", async () => {
    expect((await admin.put(`/api/v1/doctors/${drB}/schedule`).send(scheduleWith(everyDay, 20))).status).toBe(200);
  });
});

describe("booking rules", () => {
  it("does not let one patient hold two overlapping appointments with different doctors", async () => {
    const first = await book();
    const patientId = first.body.data.patient.id;
    const second = await receptionist.post("/api/v1/appointments").send({ doctorId: drB, date: FUTURE, slotStart: "09:00", purpose: "Second opinion", patientId });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("PATIENT_ALREADY_BOOKED");

    // The very next slot does not overlap, and cancelling the first frees the patient up.
    const next = await receptionist.post("/api/v1/appointments").send({ doctorId: drB, date: FUTURE, slotStart: "09:15", purpose: "Follow-up", patientId });
    expect(next.status).toBe(201);
    await receptionist.delete(`/api/v1/appointments/${first.body.data.id}`);
    const retry = await receptionist.post("/api/v1/appointments").send({ doctorId: drB, date: FUTURE, slotStart: "09:00", purpose: "Second opinion", patientId });
    expect(retry.status).toBe(201);
  });

  it("keeps an existing patient when they lose a race for a slot", async () => {
    const patient = await Patient.create({ patientCode: "PT-000001", name: "Ravi Menon", mobile: "9123456789", gender: "MALE" });
    const other = await Patient.create({ patientCode: "PT-000002", name: "Meera Iyer", mobile: "9000000000", gender: "FEMALE" });
    const attempt = (patientId: Types.ObjectId) => receptionist.post("/api/v1/appointments").send({ doctorId: drA, date: FUTURE, slotStart: "10:00", purpose: "Check-up", patientId: String(patientId) });

    const results = await Promise.all([attempt(patient._id), attempt(other._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Patient.countDocuments()).toBe(2);
    expect(await Appointment.countDocuments({ isActive: true })).toBe(1);
  });

  it("gives two patients registered at the same moment different patient codes", async () => {
    const results = await Promise.all([
      book({ slotStart: "09:00", newPatient: newPatient({ name: "First Patient" }) }),
      book({ slotStart: "09:15", newPatient: newPatient({ name: "Second Patient" }) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const codes = results.map((r) => r.body.data.patient.patientCode);
    expect(new Set(codes).size).toBe(2);
  });

  it("does not hide a lost slot behind a failed clean-up", async () => {
    await insertAppointment({ slotStart: "09:00" });
    vi.spyOn(Appointment, "exists").mockResolvedValueOnce(null as never); // get past the early check, as a real race would
    vi.spyOn(Patient, "deleteOne").mockRejectedValueOnce(new Error("database hiccup") as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await book();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SLOT_ALREADY_BOOKED");
    expect(log).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("rejects dates that are not plausible", async () => {
    expect((await book({ newPatient: newPatient({ dateOfBirth: "1850-01-01" }) })).status).toBe(400);
    expect((await book({ newPatient: newPatient({ dateOfBirth: "2999-01-01" }) })).status).toBe(400);
    expect((await book({ date: "0001-01-01" })).status).toBe(400);
    expect((await receptionist.get(`/api/v1/slots?doctorId=${drA}&date=9999-12-31`)).status).toBe(400);
    expect((await book({ newPatient: newPatient({ dateOfBirth: "1990-05-01" }) })).status).toBe(201);
  });
});

describe("patient search", () => {
  it("finds names with hyphens and apostrophes by any part of them", async () => {
    await Patient.create({ patientCode: "PT-000001", name: "Anne-Marie O'Brien", mobile: "9876543210", gender: "FEMALE" });
    const search = async (term: string) => (await receptionist.get(`/api/v1/patients?search=${encodeURIComponent(term)}`)).body.data.length;
    expect(await search("marie")).toBe(1);
    expect(await search("o'brien")).toBe(1);
    expect(await search("anne-marie bri")).toBe(1);
    expect(await search("---")).toBe(0);
  });

  it("asks for a narrower search instead of silently dropping matches in the appointment list", async () => {
    await Patient.insertMany(Array.from({ length: 1001 }, (_, i) => ({ patientCode: `PT-${String(i + 1).padStart(6, "0")}`, name: `Sam Patient${i}`, mobile: "9876543210", gender: "MALE" })));
    const broad = await receptionist.get("/api/v1/appointments?patient=sam");
    expect(broad.status).toBe(400);
    expect(broad.body.code).toBe("SEARCH_TOO_BROAD");
    expect((await receptionist.get("/api/v1/appointments?patient=sam%20patient5")).status).toBe(200);
  });
});

describe("listing appointments", () => {
  it("leaves out a row whose patient has gone instead of failing the page", async () => {
    const patient = await Patient.create({ patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210", gender: "FEMALE" });
    await insertAppointment({ patientId: patient._id, slotStart: "09:00" });
    await insertAppointment({ patientId: new Types.ObjectId(), slotStart: "09:15", slotEnd: "09:30" });

    const res = await receptionist.get("/api/v1/appointments");
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { patient: { name: string } }) => a.patient.name)).toEqual(["Asha Nair"]);
  });

  it.each(["date", "status", "createdAt"])("pages through ties without repeating or skipping rows (sorted by %s)", async (sortBy) => {
    const doctors = [drA, drB, await makeDoctor("Dr. C", "c@emr.test"), await makeDoctor("Dr. D", "d@emr.test"), await makeDoctor("Dr. E", "e@emr.test")];
    // Same date and time for everyone, so only the tie-breaker keeps the pages stable.
    const created = await Appointment.insertMany(doctors.map((doctorId) => ({ patientId: new Types.ObjectId(), doctorId, departmentId, date: FUTURE, slotStart: "09:00", slotEnd: "09:15", purpose: "Check-up" })));
    await Patient.deleteMany({});
    await Patient.insertMany(created.map((a, i) => ({ _id: a.patientId, patientCode: `PT-00000${i}`, name: `Patient ${i}`, mobile: "9876543210", gender: "MALE" })));

    const ids: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await receptionist.get(`/api/v1/appointments?sortBy=${sortBy}&order=asc&limit=2&page=${page}`);
      expect(res.body.meta).toMatchObject({ total: 5, totalPages: 3 });
      ids.push(...res.body.data.map((a: { id: string }) => a.id));
    }
    expect(new Set(ids).size).toBe(5);
  });

  it("treats an upper-case doctor id the same as a lower-case one", async () => {
    await insertAppointment({ doctorId: drA });
    const res = await receptionist.get(`/api/v1/appointments?doctorId=${drA.toUpperCase()}&doctor=dr.`);
    expect(res.body.meta.total).toBe(1);
  });
});

describe("a change that races another", () => {
  it("is refused when the appointment changed between reading and writing", async () => {
    const appointment = await insertAppointment({ status: "CANCELLED", isActive: false });
    const stale = { ...appointment.toObject(), status: "SCHEDULED" };
    vi.spyOn(Appointment, "findOne").mockReturnValueOnce({ lean: () => Promise.resolve(stale) } as never);

    await expect(updateAppointment(String(appointment._id), { notes: "late edit" }, { id: String(new Types.ObjectId()), role: "RECEPTIONIST" })).rejects.toMatchObject({
      status: 409,
      code: "APPOINTMENT_CHANGED",
    });
    vi.restoreAllMocks();
    expect((await Appointment.findById(appointment._id))!.notes).toBeUndefined();
  });
});

describe("queries use their indexes", () => {
  const usesIndex = async (query: { explain: (verbosity: "queryPlanner") => Promise<unknown> }) => {
    const plan = JSON.stringify(await query.explain("queryPlanner"));
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain("COLLSCAN");
  };

  it("for patient search by name, number and code", async () => {
    await Patient.create({ patientCode: "PT-000001", name: "Rohan Das", mobile: "+91 98765-43210", gender: "MALE" });
    await usesIndex(Patient.find(nameOrCodeFilter("das")));
    await usesIndex(Patient.find(mobileFilter("98765")));
  });

  it("for the slot lookup and the default appointment list", async () => {
    await insertAppointment();
    await usesIndex(Appointment.find({ doctorId: drA, date: FUTURE, isActive: true }));
    await usesIndex(Appointment.find({ date: { $gte: FUTURE, $lte: FUTURE } }).sort({ date: -1, slotStart: -1, _id: -1 }));
    await usesIndex(Appointment.find({}).sort({ status: 1, date: 1, slotStart: 1, _id: 1 }));
    await usesIndex(Appointment.find({}).sort({ createdAt: -1, _id: -1 }));
  });
});
