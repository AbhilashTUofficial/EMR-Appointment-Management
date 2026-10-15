import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Appointment, type AppointmentStatus } from "../src/models/appointment";
import { AuditLog } from "../src/models/auditLog";
import { Patient } from "../src/models/patient";
import { User } from "../src/models/user";
import { canTransition } from "../src/utils/appointmentStatus";
import { FUTURE, as, today, useTestDb } from "./helpers";

useTestDb();


const admin = as("SUPER_ADMIN");
const receptionist = as("RECEPTIONIST");

let cardiologyId: Types.ObjectId;
let generalId: Types.ObjectId;
let drRao: { id: string; asDoctor: ReturnType<typeof as> };
let drMehta: { id: string; asDoctor: ReturnType<typeof as> };
let asha: Types.ObjectId;
let ravi: Types.ObjectId;

const makeDoctor = async (name: string, email: string, departmentId: Types.ObjectId) => {
  const doctor = await User.create({ name, email, passwordHash: "x", role: "DOCTOR", doctorProfile: { departmentId } });
  return { id: String(doctor._id), asDoctor: as("DOCTOR", String(doctor._id)) };
};

const book = (overrides: Record<string, unknown> = {}) =>
  Appointment.create({
    patientId: asha,
    doctorId: drRao.id,
    departmentId: generalId,
    date: FUTURE,
    slotStart: "09:00",
    slotEnd: "09:15",
    purpose: "Check-up",
    ...overrides,
  });

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Appointment.deleteMany({}), Patient.deleteMany({}), AuditLog.deleteMany({})]);
  generalId = new Types.ObjectId();
  cardiologyId = new Types.ObjectId();
  drRao = await makeDoctor("Dr. Anita Rao", "rao@emr.test", generalId);
  drMehta = await makeDoctor("Dr. Vikram Mehta", "mehta@emr.test", cardiologyId);
  [asha, ravi] = (
    await Patient.create([
      { patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210", gender: "FEMALE" },
      { patientCode: "PT-000002", name: "Ravi Menon", mobile: "9123456789", gender: "MALE" },
    ])
  ).map((p) => p._id);
});

describe("appointment status workflow", () => {
  const allowed = new Set(["SCHEDULED>ARRIVED", "SCHEDULED>CANCELLED", "ARRIVED>COMPLETED"]);
  const all = ["SCHEDULED", "ARRIVED", "COMPLETED", "CANCELLED"] as const satisfies readonly AppointmentStatus[];

  // Every pair of statuses: only the three moves in the workflow are allowed.
  it.each(all.flatMap((from) => all.map((to) => [from, to] as const)))("%s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
  });
});

describe("GET /appointments", () => {
  beforeEach(async () => {
    await book({ date: "2099-03-02", slotStart: "09:00", patientId: asha, purpose: "Fever" });
    await book({ date: "2099-03-02", slotStart: "09:15", patientId: ravi, status: "ARRIVED" });
    await book({ date: "2099-03-03", slotStart: "10:00", patientId: asha, status: "CANCELLED", isActive: false });
    await book({ date: "2099-03-04", slotStart: "11:00", patientId: ravi, doctorId: drMehta.id, departmentId: cardiologyId });
  });

  const list = async (query = "", viewer: ReturnType<typeof as> = receptionist) => (await viewer.get(`/api/v1/appointments${query}`)).body;
  const times = (body: { data: { date: string; slotStart: string }[] }) => body.data.map((a) => `${a.date} ${a.slotStart}`);

  it("returns a page with the patient and doctor attached, and the paging details", async () => {
    const body = await list("?limit=2&page=1");
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(body.data[0]).toMatchObject({
      patient: { patientCode: expect.stringMatching(/^PT-/), name: expect.any(String), mobile: expect.any(String) },
      doctor: { name: expect.stringContaining("Dr.") },
      status: expect.any(String),
    });
    expect((await list("?limit=2&page=2")).data).toHaveLength(2);
    expect((await list("?limit=2&page=3")).data).toHaveLength(0);
  });

  it("sorts by date, newest first by default, and in the requested direction", async () => {
    expect(times(await list())).toEqual(["2099-03-04 11:00", "2099-03-03 10:00", "2099-03-02 09:15", "2099-03-02 09:00"]);
    expect(times(await list("?order=asc"))).toEqual(["2099-03-02 09:00", "2099-03-02 09:15", "2099-03-03 10:00", "2099-03-04 11:00"]);
  });

  it("filters by status, department, doctor and date range", async () => {
    expect(times(await list("?status=CANCELLED"))).toEqual(["2099-03-03 10:00"]);
    expect(times(await list(`?departmentId=${cardiologyId}`))).toEqual(["2099-03-04 11:00"]);
    expect(times(await list(`?doctorId=${drMehta.id}`))).toEqual(["2099-03-04 11:00"]);
    expect(times(await list("?from=2099-03-03&to=2099-03-03"))).toEqual(["2099-03-03 10:00"]);
    expect(times(await list("?from=2099-03-03"))).toHaveLength(2);
    expect(times(await list("?to=2099-03-02"))).toHaveLength(2);
  });

  it("searches by patient name or ID, mobile number and doctor name", async () => {
    expect((await list("?patient=asha")).meta.total).toBe(2);
    expect((await list("?patient=PT-000002")).meta.total).toBe(2);
    expect((await list("?mobile=91234")).meta.total).toBe(2);
    expect((await list("?patient=nair")).meta.total).toBe(2); // any word of the name
    expect((await list("?mobile=%2B919123")).meta.total).toBe(0); // not Ravi: his number is stored without a country code, so it starts 9123, not 919123
    expect((await list("?patient=asha&mobile=91234")).meta.total).toBe(0);
    expect((await list("?doctor=mehta")).meta.total).toBe(1);
    expect((await list(`?doctor=anita&doctorId=${drMehta.id}`)).meta.total).toBe(0);
    expect((await list("?patient=nobody")).data).toEqual([]);
  });

  it("treats search text literally and rejects bad parameters", async () => {
    expect((await list("?patient=.*")).meta.total).toBe(0);
    for (const bad of ["?limit=51", "?limit=0", "?page=0", "?page=10001", "?sortBy=passwordHash", "?order=sideways", "?status=DONE", "?from=2099-13-01", "?from=2099-03-05&to=2099-03-01", "?doctorId=nope"]) {
      expect((await receptionist.get(`/api/v1/appointments${bad}`)).status, bad).toBe(400);
    }
  });

  it("shows a doctor only their own appointments, whatever filters they send", async () => {
    expect((await list("", drRao.asDoctor)).meta.total).toBe(3);
    expect((await list(`?doctorId=${drMehta.id}`, drRao.asDoctor)).meta.total).toBe(3);
    expect((await list("", drMehta.asDoctor)).meta.total).toBe(1);
  });

  it("keeps clinical notes from the front desk", async () => {
    await Appointment.updateOne({ slotStart: "09:00" }, { consultationNotes: "Viral fever" });
    const forDesk = (await list("?patient=asha&status=SCHEDULED", receptionist)).data[0];
    const forDoctor = (await list("?patient=asha&status=SCHEDULED", drRao.asDoctor)).data[0];
    expect(forDesk).not.toHaveProperty("consultationNotes");
    expect(forDoctor.consultationNotes).toBe("Viral fever");
  });

  it("needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/appointments")).status).toBe(401);
  });
});

describe("GET /appointments/:id", () => {
  it("returns one appointment, but not another doctor's", async () => {
    const appointment = await book();
    expect((await receptionist.get(`/api/v1/appointments/${appointment._id}`)).body.data).toMatchObject({ patient: { name: "Asha Nair" }, doctor: { name: "Dr. Anita Rao" } });
    expect((await drRao.asDoctor.get(`/api/v1/appointments/${appointment._id}`)).status).toBe(200);
    expect((await drMehta.asDoctor.get(`/api/v1/appointments/${appointment._id}`)).status).toBe(404);
    expect((await receptionist.get("/api/v1/appointments/64b000000000000000000000")).status).toBe(404);
    expect((await receptionist.get("/api/v1/appointments/nope")).status).toBe(400);
  });
});

describe("PUT /appointments/:id", () => {
  it("lets the front desk change the purpose and notes, and logs it", async () => {
    const appointment = await book();
    const res = await receptionist.put(`/api/v1/appointments/${appointment._id}`).send({ purpose: "Fever and cough", notes: "Prefers a morning slot" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ purpose: "Fever and cough", notes: "Prefers a morning slot" });
    expect(await AuditLog.countDocuments({ action: "APPOINTMENT_UPDATED" })).toBe(1);
  });

  it("only lets doctors add consultation notes, and only after the patient has arrived", async () => {
    const appointment = await book();
    const url = `/api/v1/appointments/${appointment._id}`;

    expect((await drRao.asDoctor.put(url).send({ consultationNotes: "Too early" })).status).toBe(409);
    await Appointment.updateOne({ _id: appointment._id }, { status: "ARRIVED" });
    const res = await drRao.asDoctor.put(url).send({ consultationNotes: "Viral fever, rest advised" });
    expect(res.status).toBe(200);
    expect(res.body.data.consultationNotes).toBe("Viral fever, rest advised");

    expect((await drRao.asDoctor.put(url).send({ purpose: "Changed by doctor" })).status).toBe(403);
    expect((await receptionist.put(url).send({ consultationNotes: "Changed by desk" })).status).toBe(403);
    expect((await drMehta.asDoctor.put(url).send({ consultationNotes: "Not my patient" })).status).toBe(404);
  });

  it("refuses edits to cancelled and completed appointments, and empty updates", async () => {
    const cancelled = await book({ status: "CANCELLED", isActive: false, slotStart: "10:00" });
    const completed = await book({ status: "COMPLETED", slotStart: "10:15" });
    expect((await receptionist.put(`/api/v1/appointments/${cancelled._id}`).send({ purpose: "x" })).status).toBe(409);
    expect((await receptionist.put(`/api/v1/appointments/${completed._id}`).send({ purpose: "x" })).status).toBe(409);
    expect((await drRao.asDoctor.put(`/api/v1/appointments/${completed._id}`).send({ consultationNotes: "Late note" })).status).toBe(200);
    expect((await receptionist.put(`/api/v1/appointments/${completed._id}`).send({})).status).toBe(400);
    expect((await receptionist.put(`/api/v1/appointments/${completed._id}`).send({ purpose: "  " })).status).toBe(400);
  });
});

describe("arrive, cancel and complete", () => {
  it("marks a patient as arrived on the day, and not twice", async () => {
    const appointment = await book({ date: today() });
    const url = `/api/v1/appointments/${appointment._id}/arrive`;

    const res = await receptionist.post(url);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ARRIVED");
    expect((await Appointment.findById(appointment._id))!.arrivedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "APPOINTMENT_ARRIVED" })).toBe(1);

    const again = await receptionist.post(url);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("won't mark a patient as arrived before the day of the appointment", async () => {
    const appointment = await book();
    const res = await receptionist.post(`/api/v1/appointments/${appointment._id}/arrive`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_TODAY");
  });

  it("cancels a scheduled appointment, frees its slot and logs it", async () => {
    const appointment = await book();
    const res = await receptionist.delete(`/api/v1/appointments/${appointment._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");

    const stored = await Appointment.findById(appointment._id);
    expect(stored).toMatchObject({ isActive: false });
    expect(stored!.cancelledAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "APPOINTMENT_CANCELLED" })).toBe(1);

    // The slot can be booked again.
    await expect(book()).resolves.toBeTruthy();
  });

  it("won't cancel an appointment once the patient has arrived or the visit is done", async () => {
    const arrived = await book({ status: "ARRIVED", slotStart: "10:00" });
    const completed = await book({ status: "COMPLETED", slotStart: "10:15" });
    expect((await receptionist.delete(`/api/v1/appointments/${arrived._id}`)).status).toBe(409);
    expect((await receptionist.delete(`/api/v1/appointments/${completed._id}`)).status).toBe(409);
  });

  it("lets the appointment's own doctor complete it after arrival", async () => {
    const scheduled = await book({ slotStart: "10:00" });
    const arrived = await book({ status: "ARRIVED", slotStart: "10:15" });

    expect((await drRao.asDoctor.post(`/api/v1/appointments/${scheduled._id}/complete`)).status).toBe(409);
    expect((await drMehta.asDoctor.post(`/api/v1/appointments/${arrived._id}/complete`)).status).toBe(404);
    expect((await receptionist.post(`/api/v1/appointments/${arrived._id}/complete`)).status).toBe(403);

    const res = await drRao.asDoctor.post(`/api/v1/appointments/${arrived._id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("COMPLETED");
    expect((await Appointment.findById(arrived._id))!.completedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "APPOINTMENT_COMPLETED" })).toBe(1);
  });

  it("only lets the front desk cancel and mark arrival", async () => {
    const appointment = await book({ date: today() });
    expect((await drRao.asDoctor.delete(`/api/v1/appointments/${appointment._id}`)).status).toBe(403);
    expect((await drRao.asDoctor.post(`/api/v1/appointments/${appointment._id}/arrive`)).status).toBe(403);
    expect((await admin.post(`/api/v1/appointments/${appointment._id}/arrive`)).status).toBe(200);
  });

  it("lets only one of two conflicting changes win", async () => {
    const appointment = await book({ date: today() });
    const responses = await Promise.all([
      receptionist.post(`/api/v1/appointments/${appointment._id}/arrive`),
      receptionist.delete(`/api/v1/appointments/${appointment._id}`),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("returns 404 for an unknown appointment", async () => {
    expect((await receptionist.delete("/api/v1/appointments/64b000000000000000000000")).status).toBe(404);
  });
});

describe("GET /dashboard/summary", () => {
  beforeEach(async () => {
    await book({ date: today(), slotStart: "09:00" });
    await book({ date: today(), slotStart: "09:15", status: "ARRIVED" });
    await book({ date: today(), slotStart: "09:30", status: "CANCELLED", isActive: false });
    await book({ date: today(), slotStart: "10:00", doctorId: drMehta.id, departmentId: cardiologyId });
    await book({ date: FUTURE, slotStart: "10:15" });
  });

  it("counts today's appointments by status", async () => {
    const { data } = (await receptionist.get("/api/v1/dashboard/summary")).body;
    expect(data).toEqual({ date: today(), counts: { SCHEDULED: 2, ARRIVED: 1, COMPLETED: 0, CANCELLED: 1 } });
  });

  it("counts only a doctor's own appointments, and gives the admin overall totals", async () => {
    expect((await drMehta.asDoctor.get("/api/v1/dashboard/summary")).body.data.counts.SCHEDULED).toBe(1);
    expect((await drRao.asDoctor.get("/api/v1/dashboard/summary")).body.data.counts.SCHEDULED).toBe(1);
    expect((await admin.get("/api/v1/dashboard/summary")).body.data.totals).toEqual({ doctors: 2, patients: 2 });
    expect((await request(app).get("/api/v1/dashboard/summary")).status).toBe(401);
  });
});
