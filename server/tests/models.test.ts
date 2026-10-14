import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Appointment } from "../src/models/appointment";
import { Department } from "../src/models/department";
import { Patient } from "../src/models/patient";
import { RefreshToken } from "../src/models/refreshToken";
import { User } from "../src/models/user";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Indexes are built in the background; wait so the tests below can rely on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const slot = (overrides = {}) => ({
  patientId: new Types.ObjectId(),
  doctorId: new Types.ObjectId(),
  departmentId: new Types.ObjectId(),
  date: "2026-10-20",
  slotStart: "09:00",
  slotEnd: "09:15",
  ...overrides,
});

describe("appointment slot index", () => {
  it("rejects a second active booking of the same doctor slot", async () => {
    const doctorId = new Types.ObjectId();
    await Appointment.create(slot({ doctorId }));
    await expect(Appointment.create(slot({ doctorId }))).rejects.toMatchObject({ code: 11000 });
  });

  it("frees the slot when the appointment is no longer active", async () => {
    const doctorId = new Types.ObjectId();
    const first = await Appointment.create(slot({ doctorId, slotStart: "10:00" }));
    await first.updateOne({ status: "CANCELLED", isActive: false });
    await expect(Appointment.create(slot({ doctorId, slotStart: "10:00" }))).resolves.toBeTruthy();
  });

  it("allows the same time for a different doctor or a different date", async () => {
    const doctorId = new Types.ObjectId();
    await Appointment.create(slot({ doctorId, slotStart: "11:00" }));
    await expect(Appointment.create(slot({ slotStart: "11:00" }))).resolves.toBeTruthy();
    await expect(Appointment.create(slot({ doctorId, slotStart: "11:00", date: "2026-10-21" }))).resolves.toBeTruthy();
  });
});

describe("users", () => {
  const doctor = { name: "Dr X", email: "Dr.X@emr.test", passwordHash: "hash", role: "DOCTOR" as const };

  it("requires a profile for doctors", async () => {
    await expect(User.create(doctor)).rejects.toThrow(/profile/i);
  });

  it("lowercases emails and keeps them unique", async () => {
    const dept = await Department.create({ name: "Cardiology", code: "car" });
    const created = await User.create({ ...doctor, doctorProfile: { departmentId: dept._id } });
    expect(created.email).toBe("dr.x@emr.test");
    expect(created.doctorProfile?.slotDurationMinutes).toBe(15);
    await expect(
      User.create({ ...doctor, email: "DR.X@emr.test", doctorProfile: { departmentId: dept._id } }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("does not return the password hash by default", async () => {
    await User.create({ name: "Rec", email: "rec@emr.test", passwordHash: "secret", role: "RECEPTIONIST" });
    const found = await User.findOne({ email: "rec@emr.test" }).lean();
    expect(found).not.toHaveProperty("passwordHash");
  });
});

describe("patients", () => {
  it("stores a lowercase name for prefix search and keeps patient codes unique", async () => {
    const p = await Patient.create({ patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210", gender: "FEMALE" });
    expect(p.nameLower).toBe("asha nair");
    await expect(
      Patient.create({ patientCode: "PT-000001", name: "Other", mobile: "9876543210", gender: "MALE" }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("refresh tokens", () => {
  it("expire automatically through a TTL index", async () => {
    const indexes = await RefreshToken.collection.indexes();
    const ttl = indexes.find((i) => i.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
  });
});
