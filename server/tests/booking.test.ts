import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Appointment } from "../src/models/appointment";
import { AuditLog } from "../src/models/auditLog";
import { Counter } from "../src/models/counter";
import { Patient } from "../src/models/patient";
import { User } from "../src/models/user";
import { FUTURE, as, useTestDb } from "./helpers";

useTestDb();

const PAST = "2000-03-06";

const receptionist = as("RECEPTIONIST");

const range = (start: string, end: string, name = "Morning") => ({ name, start, end });
// Works every day, so the tests don't depend on which weekday a date falls on.
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  sessions: [range("09:00", "12:00"), range("13:00", "17:00", "Evening")],
  breaks: [range("12:00", "13:00", "Lunch")],
}));

let doctorId: string;
const newPatient = (overrides = {}) => ({ name: "Asha Nair", mobile: "98765 43210", gender: "FEMALE", ...overrides });
const booking = (overrides = {}) => ({
  doctorId,
  date: FUTURE,
  slotStart: "09:00",
  purpose: "Fever for three days",
  newPatient: newPatient(),
  ...overrides,
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Appointment.deleteMany({}), Patient.deleteMany({}), Counter.deleteMany({}), AuditLog.deleteMany({})]);
  const doctor = await User.create({
    name: "Dr. Book",
    email: "book@emr.test",
    passwordHash: "x",
    role: "DOCTOR",
    doctorProfile: { departmentId: new Types.ObjectId(), slotDurationMinutes: 15, workingDays: everyDay },
  });
  doctorId = String(doctor._id);
});

describe("GET /patients", () => {
  beforeEach(async () => {
    await Patient.create([
      { patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210", gender: "FEMALE" },
      { patientCode: "PT-000002", name: "Ashok Kumar", mobile: "9123456789", gender: "MALE" },
      { patientCode: "PT-000003", name: "Ravi Menon", mobile: "9876500000", gender: "MALE" },
    ]);
  });

  const search = async (term: string) => (await receptionist.get(`/api/v1/patients?search=${encodeURIComponent(term)}`)).body.data;
  const names = (patients: { name: string }[]) => patients.map((p) => p.name);

  it("finds patients by the start of their name, ignoring case", async () => {
    expect(names(await search("ash"))).toEqual(["Asha Nair", "Ashok Kumar"]);
    expect(names(await search("ASHA N"))).toEqual(["Asha Nair"]);
  });

  it("finds a patient by patient code", async () => {
    expect(names(await search("pt-000003"))).toEqual(["Ravi Menon"]);
  });

  it("finds patients by the start of their mobile number", async () => {
    expect(names(await search("98765"))).toEqual(["Asha Nair", "Ravi Menon"]);
    expect(names(await search("+44"))).toEqual([]);
  });

  it("finds a patient by any word of their name", async () => {
    expect(names(await search("nair"))).toEqual(["Asha Nair"]);
    expect(names(await search("menon ravi"))).toEqual(["Ravi Menon"]);
    expect(names(await search("kum"))).toEqual(["Ashok Kumar"]);
  });

  it("finds a patient by their mobile number with or without the country code", async () => {
    await Patient.create({ patientCode: "PT-000004", name: "Rohan Das", mobile: "+91 90000-11111", gender: "MALE" });
    for (const term of ["9000011111", "90000", "+919000011111", "+91 90000 11", "91-90000"]) {
      expect(names(await search(term)), term).toEqual(["Rohan Das"]);
    }
  });

  it("treats the search text literally, not as a pattern", async () => {
    expect(await search(".*")).toEqual([]);
  });

  it("returns only the fields needed to pick a patient", async () => {
    const [patient] = await search("ravi");
    expect(patient).toMatchObject({ patientCode: "PT-000003", name: "Ravi Menon", mobile: "9876500000", gender: "MALE" });
    expect(patient).not.toHaveProperty("_id");
    expect(patient).not.toHaveProperty("nameLower");
  });

  it("is limited to admins and receptionists, and needs a search term", async () => {
    expect((await as("DOCTOR").get("/api/v1/patients?search=a")).status).toBe(403);
    expect((await request(app).get("/api/v1/patients?search=a")).status).toBe(401);
    expect((await receptionist.get("/api/v1/patients")).status).toBe(400);
    expect((await receptionist.get("/api/v1/patients?search=")).status).toBe(400);
  });
});

describe("POST /appointments", () => {
  it("books a slot for a new patient, creating the patient with the next patient code", async () => {
    const first = await receptionist.post("/api/v1/appointments").send(booking());
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      date: FUTURE,
      slotStart: "09:00",
      slotEnd: "09:15",
      status: "SCHEDULED",
      purpose: "Fever for three days",
      doctor: { id: doctorId, name: "Dr. Book" },
      patient: { patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210" },
    });

    const second = await receptionist.post("/api/v1/appointments").send(booking({ slotStart: "09:15", newPatient: newPatient({ name: "Ravi Menon" }) }));
    expect(second.body.data.patient.patientCode).toBe("PT-000002");
  });

  it("books a slot for an existing patient without creating another one", async () => {
    const patient = await Patient.create({ patientCode: "PT-000009", name: "Old Patient", mobile: "9000000000", gender: "MALE" });
    const res = await receptionist
      .post("/api/v1/appointments")
      .send(booking({ newPatient: undefined, patientId: String(patient._id) }));
    expect(res.status).toBe(201);
    expect(res.body.data.patient.id).toBe(String(patient._id));
    expect(await Patient.countDocuments()).toBe(1);
  });

  it("links the appointment to the patient, doctor, department and slot, and logs it", async () => {
    const res = await receptionist.post("/api/v1/appointments").send(booking());
    const stored = await Appointment.findById(res.body.data.id);
    expect(String(stored!.doctorId)).toBe(doctorId);
    expect(String(stored!.patientId)).toBe(res.body.data.patient.id);
    expect(stored!.departmentId).toBeTruthy();
    expect(stored!.isActive).toBe(true);

    const actions = (await AuditLog.find()).map((a) => a.action).sort();
    expect(actions).toEqual(["APPOINTMENT_CREATED", "PATIENT_CREATED"]);
  });

  it("is limited to admins and receptionists", async () => {
    expect((await as("DOCTOR").post("/api/v1/appointments").send(booking())).status).toBe(403);
    expect((await request(app).post("/api/v1/appointments").send(booking())).status).toBe(401);
    expect((await as("SUPER_ADMIN").post("/api/v1/appointments").send(booking())).status).toBe(201);
  });

  describe("rejects", () => {
    const rejected = async (body: object, status: number, code: string) => {
      const res = await receptionist.post("/api/v1/appointments").send(body);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expect(await Appointment.countDocuments()).toBe(0);
      expect(await Patient.countDocuments()).toBe(0);
    };

    it("a slot in the past", () => rejected(booking({ date: PAST }), 400, "SLOT_IN_PAST"));
    it("a time inside a break", () => rejected(booking({ slotStart: "12:00" }), 400, "SLOT_NOT_AVAILABLE"));
    it("a time that isn't on the slot grid", () => rejected(booking({ slotStart: "09:07" }), 400, "SLOT_NOT_AVAILABLE"));
    it("a time outside working hours", () => rejected(booking({ slotStart: "20:00" }), 400, "SLOT_NOT_AVAILABLE"));
    it("an unknown doctor", () => rejected(booking({ doctorId: "64b000000000000000000000" }), 404, "DOCTOR_NOT_FOUND"));
    it("an unknown patient", () =>
      rejected(booking({ newPatient: undefined, patientId: "64b000000000000000000000" }), 404, "PATIENT_NOT_FOUND"));
    it("both an existing and a new patient", () => rejected(booking({ patientId: "64b000000000000000000000" }), 400, "VALIDATION_ERROR"));
    it("neither an existing nor a new patient", () => rejected(booking({ newPatient: undefined }), 400, "VALIDATION_ERROR"));
    it("an invalid mobile number", () => rejected(booking({ newPatient: newPatient({ mobile: "12345" }) }), 400, "VALIDATION_ERROR"));
    it("a missing purpose", () => rejected(booking({ purpose: "  " }), 400, "VALIDATION_ERROR"));
    it("an impossible date", () => rejected(booking({ date: "2099-02-31" }), 400, "VALIDATION_ERROR"));
  });

  describe("double booking", () => {
    it("rejects a second booking of the same slot and doesn't leave a patient behind", async () => {
      expect((await receptionist.post("/api/v1/appointments").send(booking())).status).toBe(201);

      const second = await receptionist.post("/api/v1/appointments").send(booking({ newPatient: newPatient({ name: "Someone Else" }) }));
      expect(second.status).toBe(409);
      expect(second.body.code).toBe("SLOT_ALREADY_BOOKED");
      expect(await Appointment.countDocuments()).toBe(1);
      expect(await Patient.countDocuments()).toBe(1);
    });

    it("allows the slot again once the appointment is cancelled", async () => {
      const first = await receptionist.post("/api/v1/appointments").send(booking());
      await Appointment.updateOne({ _id: first.body.data.id }, { status: "CANCELLED", isActive: false });

      expect((await receptionist.post("/api/v1/appointments").send(booking())).status).toBe(201);
    });

    it("lets only one of many simultaneous requests book the slot", async () => {
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          receptionist.post("/api/v1/appointments").send(booking({ newPatient: newPatient({ name: `Patient ${i + 10}` }) })),
        ),
      );

      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(11);
      expect(await Appointment.countDocuments({ doctorId, date: FUTURE, slotStart: "09:00" })).toBe(1);
      // Every request that lost the race removed the patient it had just created.
      expect(await Patient.countDocuments()).toBe(1);
    });

    it("lets different slots be booked at the same time", async () => {
      const slots = ["09:00", "09:15", "09:30", "09:45"];
      const responses = await Promise.all(slots.map((slotStart) => receptionist.post("/api/v1/appointments").send(booking({ slotStart }))));
      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    });
  });
});
