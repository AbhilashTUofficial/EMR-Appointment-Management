import bcrypt from "bcrypt";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { AuditLog } from "../src/models/auditLog";
import { Department } from "../src/models/department";
import { User } from "../src/models/user";
import { as, useTestDb } from "./helpers";

useTestDb();

const admin = as("SUPER_ADMIN");
const receptionist = as("RECEPTIONIST");

let cardiology: string;
let general: string;

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Department.deleteMany({}), AuditLog.deleteMany({})]);
  const departments = await Department.create([
    { name: "General", code: "GEN" },
    { name: "Cardiology", code: "CAR" },
  ]);
  [general, cardiology] = departments.map((d) => String(d._id));
});

const newDoctor = (overrides = {}) => ({
  name: "Dr. Test",
  email: "dr.test@emr.test",
  password: "Passw0rd!123",
  departmentId: general,
  ...overrides,
});

const range = (start: string, end: string, name = "Morning") => ({ name, start, end });
const day = (sessions: object[], breaks: object[] = [], dayOfWeek = 1) => ({ day: dayOfWeek, sessions, breaks });
const validSchedule = {
  slotDurationMinutes: 15,
  workingDays: [day([range("09:00", "12:00"), range("13:00", "17:00", "Evening")], [range("12:00", "13:00", "Lunch")])],
};

describe("POST /doctors", () => {
  it("lets an admin create a doctor with an empty schedule, and logs it", async () => {
    const res = await admin.post("/api/v1/doctors").send(newDoctor());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Dr. Test", departmentId: general, slotDurationMinutes: 15, workingDays: [] });
    expect(res.body.data).not.toHaveProperty("passwordHash");

    const stored = await User.findOne({ email: "dr.test@emr.test" }).select("+passwordHash");
    expect(await bcrypt.compare("Passw0rd!123", stored!.passwordHash)).toBe(true);
    expect(await AuditLog.countDocuments({ action: "USER_CREATED" })).toBe(1);
  });

  it("is admin only", async () => {
    expect((await receptionist.post("/api/v1/doctors").send(newDoctor())).status).toBe(403);
    expect((await as("DOCTOR").post("/api/v1/doctors").send(newDoctor())).status).toBe(403);
    expect((await request(app).post("/api/v1/doctors").send(newDoctor())).status).toBe(401);
  });

  it("rejects a duplicate email, an unknown department and invalid input", async () => {
    await admin.post("/api/v1/doctors").send(newDoctor());
    const duplicate = await admin.post("/api/v1/doctors").send(newDoctor({ email: "DR.TEST@emr.test" }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("EMAIL_TAKEN");

    const unknownDepartment = await admin
      .post("/api/v1/doctors")
      .send(newDoctor({ email: "x@emr.test", departmentId: "64b000000000000000000000" }));
    expect(unknownDepartment.status).toBe(404);

    const tooLong = await admin.post("/api/v1/doctors").send(newDoctor({ email: "long@emr.test", password: "é".repeat(40) }));
    expect(tooLong.status).toBe(400); // 80 bytes: bcrypt would silently cut it at 72

    const invalid = await admin.post("/api/v1/doctors").send(newDoctor({ password: "short", departmentId: "nope" }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["departmentId", "password"]);
  });
});

describe("POST /receptionists", () => {
  it("lets an admin create a receptionist and nobody else", async () => {
    const body = { name: "Riya", email: "riya@emr.test", password: "Passw0rd!123" };
    expect((await receptionist.post("/api/v1/receptionists").send(body)).status).toBe(403);

    const res = await admin.post("/api/v1/receptionists").send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: "riya@emr.test", role: "RECEPTIONIST" });
    expect((await admin.post("/api/v1/receptionists").send(body)).status).toBe(409);
  });
});

describe("PUT /doctors/:id/schedule", () => {
  const createDoctor = async () => (await admin.post("/api/v1/doctors").send(newDoctor())).body.data.id as string;

  it("saves a schedule with sessions and a break, and logs it", async () => {
    const id = await createDoctor();
    const res = await admin.put(`/api/v1/doctors/${id}/schedule`).send(validSchedule);
    expect(res.status).toBe(200);
    expect(res.body.data.workingDays[0].breaks[0]).toMatchObject({ start: "12:00", end: "13:00" });
    expect(await AuditLog.countDocuments({ action: "SCHEDULE_UPDATED" })).toBe(1);
  });

  it("is admin only", async () => {
    const id = await createDoctor();
    expect((await receptionist.put(`/api/v1/doctors/${id}/schedule`).send(validSchedule)).status).toBe(403);
  });

  it.each([
    ["a session that ends before it starts", { ...validSchedule, workingDays: [day([range("12:00", "09:00")])] }],
    ["overlapping sessions", { ...validSchedule, workingDays: [day([range("09:00", "12:00"), range("11:00", "14:00")])] }],
    ["overlapping breaks", { ...validSchedule, workingDays: [day([range("09:00", "17:00")], [range("12:00", "13:00"), range("12:30", "13:30")])] }],
    ["the same day twice", { ...validSchedule, workingDays: [validSchedule.workingDays[0], validSchedule.workingDays[0]] }],
    ["a day with no sessions", { ...validSchedule, workingDays: [day([], [], 2)] }],
    ["a bad time format", { ...validSchedule, workingDays: [day([range("9am", "12:00")])] }],
    ["a day outside 0-6", { ...validSchedule, workingDays: [day([range("09:00", "12:00")], [], 7)] }],
    ["a slot length under 5 minutes", { ...validSchedule, slotDurationMinutes: 3 }],
    ["a fractional slot length", { ...validSchedule, slotDurationMinutes: 7.5 }],
    ["a session shorter than one slot", { slotDurationMinutes: 30, workingDays: [day([range("09:00", "09:20")])] }],
  ])("rejects %s", async (_name, body) => {
    const id = await createDoctor();
    const res = await admin.put(`/api/v1/doctors/${id}/schedule`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for an unknown doctor and 400 for a malformed id", async () => {
    expect((await admin.put("/api/v1/doctors/64b000000000000000000000/schedule").send(validSchedule)).status).toBe(404);
    expect((await admin.put("/api/v1/doctors/not-an-id/schedule").send(validSchedule)).status).toBe(400);
  });
});

describe("GET /doctors and /departments", () => {
  it("lists all doctors for staff, filters by department, and shows a doctor only themselves", async () => {
    const a = (await admin.post("/api/v1/doctors").send(newDoctor({ email: "a@emr.test", name: "Dr A", departmentId: general }))).body.data;
    await admin.post("/api/v1/doctors").send(newDoctor({ email: "b@emr.test", name: "Dr B", departmentId: cardiology }));
    const names = (res: request.Response) => res.body.data.map((d: { name: string }) => d.name);

    expect(names(await receptionist.get("/api/v1/doctors"))).toEqual(["Dr A", "Dr B"]);
    expect(names(await receptionist.get(`/api/v1/doctors?departmentId=${cardiology}`))).toEqual(["Dr B"]);
    expect(names(await as("DOCTOR", a.id).get("/api/v1/doctors"))).toEqual(["Dr A"]);
    expect((await receptionist.get("/api/v1/doctors?departmentId=bad")).status).toBe(400);
  });

  it("lists departments for any signed-in user", async () => {
    const res = await as("DOCTOR").get("/api/v1/departments");
    expect(res.body.data.map((d: { name: string }) => d.name)).toEqual(["Cardiology", "General"]);
    expect((await request(app).get("/api/v1/departments")).status).toBe(401);
  });
});
