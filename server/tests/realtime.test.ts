import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import request from "supertest";
import { Types } from "mongoose";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Appointment } from "../src/models/appointment";
import { Patient } from "../src/models/patient";
import { User } from "../src/models/user";
import { closeRealtime, initRealtime } from "../src/realtime";
import { accessToken, useTestDb } from "./helpers";

useTestDb();

const FUTURE = "2099-03-02";
let server: Server;
let port: number;
const open: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  closeRealtime();
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => open.splice(0).forEach((socket) => socket.close()));

const connect = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connectClient(`http://localhost:${port}`, { auth: { token }, reconnection: false, transports: ["websocket"] });
    open.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });

const next = <T = Record<string, string>>(socket: Socket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} received`)), 2000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

// Resolves true if the event does NOT arrive within a short time.
const staysQuiet = (socket: Socket, event: string, ms = 400) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

const as = (role: string, id?: string) => {
  const auth = `Bearer ${accessToken(role, id)}`;
  return {
    post: (url: string) => request(app).post(url).set("Authorization", auth),
    put: (url: string) => request(app).put(url).set("Authorization", auth),
    delete: (url: string) => request(app).delete(url).set("Authorization", auth),
  };
};

let rao: string;
let mehta: string;
let patientId: Types.ObjectId;

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Appointment.deleteMany({}), Patient.deleteMany({})]);
  const schedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, sessions: [{ name: "Day", start: "09:00", end: "17:00" }], breaks: [] }));
  const doctor = async (name: string, email: string) =>
    String((await User.create({ name, email, passwordHash: "x", role: "DOCTOR", doctorProfile: { departmentId: new Types.ObjectId(), slotDurationMinutes: 15, workingDays: schedule } }))._id);
  rao = await doctor("Dr. Rao", "rao@emr.test");
  mehta = await doctor("Dr. Mehta", "mehta@emr.test");
  patientId = (await Patient.create({ patientCode: "PT-000001", name: "Asha Nair", mobile: "9876543210", gender: "FEMALE" }))._id;
});

const book = (doctorId: string, slotStart = "09:00") =>
  as("RECEPTIONIST").post("/api/v1/appointments").send({ doctorId, date: FUTURE, slotStart, purpose: "Check-up", patientId: String(patientId) });

describe("connecting", () => {
  it("needs a valid access token", async () => {
    const refreshSecretToken = jwt.sign({ role: "SUPER_ADMIN" }, "test-refresh-secret-test-refresh-secret", { subject: "x" });
    const unknownRole = jwt.sign({ role: "GOD" }, "test-access-secret-test-access-secret", { subject: "x" });

    for (const token of [undefined, "garbage", refreshSecretToken, unknownRole]) {
      await expect(connect(token)).rejects.toThrow("UNAUTHORIZED");
    }
    await expect(connect(accessToken("RECEPTIONIST"))).resolves.toBeTruthy();
  });
});

describe("appointment events", () => {
  it("tells staff when an appointment is booked, with only what is needed to refetch", async () => {
    const staff = await connect(accessToken("RECEPTIONIST"));
    const admin = await connect(accessToken("SUPER_ADMIN"));
    const created = Promise.all([next(staff, "appointment:created"), next(admin, "appointment:created")]);

    const res = await book(rao);
    const [seenByStaff, seenByAdmin] = await created;

    expect(seenByStaff).toEqual({ id: res.body.data.id, doctorId: rao, date: FUTURE, slotStart: "09:00", status: "SCHEDULED" });
    expect(seenByAdmin).toEqual(seenByStaff);
  });

  it("tells a doctor only about their own appointments", async () => {
    const raoSocket = await connect(accessToken("DOCTOR", rao));
    const mehtaSocket = await connect(accessToken("DOCTOR", mehta));
    const raoEvent = next(raoSocket, "appointment:created");
    const mehtaQuiet = staysQuiet(mehtaSocket, "appointment:created");

    await book(rao);

    expect(await raoEvent).toMatchObject({ doctorId: rao });
    expect(await mehtaQuiet).toBe(true);
  });

  it("announces edits, arrivals, completions and cancellations", async () => {
    const staff = await connect(accessToken("RECEPTIONIST"));
    const doctor = await connect(accessToken("DOCTOR", rao));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const id = String((await Appointment.create({ patientId, doctorId: rao, departmentId: new Types.ObjectId(), date: today, slotStart: "09:00", slotEnd: "09:15", purpose: "Fever" }))._id);
    const url = `/api/v1/appointments/${id}`;

    const edited = next(staff, "appointment:updated");
    await as("RECEPTIONIST").put(url).send({ purpose: "Fever and cough" });
    expect(await edited).toMatchObject({ id, status: "SCHEDULED" });

    const arrived = Promise.all([next(staff, "appointment:updated"), next(doctor, "appointment:updated")]);
    await as("RECEPTIONIST").post(`${url}/arrive`);
    expect((await arrived)[1]).toMatchObject({ id, status: "ARRIVED" });

    const completed = next(staff, "appointment:updated");
    await as("DOCTOR", rao).post(`${url}/complete`);
    expect(await completed).toMatchObject({ id, status: "COMPLETED" });

    const other = String((await Appointment.create({ patientId, doctorId: rao, departmentId: new Types.ObjectId(), date: FUTURE, slotStart: "10:00", slotEnd: "10:15", purpose: "Check-up" }))._id);
    const cancelled = next(doctor, "appointment:cancelled");
    await as("RECEPTIONIST").delete(`/api/v1/appointments/${other}`);
    expect(await cancelled).toMatchObject({ id: other, status: "CANCELLED" });
  });

  it("sends nothing when a request fails", async () => {
    const staff = await connect(accessToken("RECEPTIONIST"));
    const first = next(staff, "appointment:created");
    expect((await book(rao)).status).toBe(201);
    await first;

    const quiet = staysQuiet(staff, "appointment:created");
    expect((await book(rao)).status).toBe(409);
    expect(await quiet).toBe(true);
  });
});
