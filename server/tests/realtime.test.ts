import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Appointment } from "../src/models/appointment";
import { Patient } from "../src/models/patient";
import { User } from "../src/models/user";
import { initRealtime } from "../src/realtime";
import { FUTURE, TEST_ACCESS_SECRET, TEST_REFRESH_SECRET, accessToken, as, today, useTestDb } from "./helpers";

useTestDb();

let server: Server;
let realtime: ReturnType<typeof initRealtime>;
let port: number;
const open: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  realtime = initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  realtime.close();
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

// Runs the action, then waits a moment longer: true if the event never arrived.
const staysQuiet = async (socket: Socket, event: string, action: () => Promise<unknown>, ms = 400) => {
  let received = false;
  socket.once(event, () => {
    received = true;
  });
  await action();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !received;
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
    const refreshSecretToken = jwt.sign({ role: "SUPER_ADMIN" }, TEST_REFRESH_SECRET, { subject: "x" });
    const unknownRole = jwt.sign({ role: "GOD" }, TEST_ACCESS_SECRET, { subject: "x" });

    for (const token of [undefined, "garbage", refreshSecretToken, unknownRole]) {
      await expect(connect(token)).rejects.toThrow("UNAUTHORIZED");
    }
    await expect(connect(accessToken("RECEPTIONIST"))).resolves.toBeTruthy();
  });
});

describe("expiry", () => {
  it("closes the connection when the access token runs out", async () => {
    const socket = await connect(accessToken("RECEPTIONIST", undefined, 1));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("still connected after the token expired")), 4000);
      socket.on("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
});

describe("schedule changes", () => {
  it("tells staff and the doctor when a schedule is saved, but not other doctors", async () => {
    const staff = await connect(accessToken("RECEPTIONIST"));
    const raoSocket = await connect(accessToken("DOCTOR", rao));
    const mehtaSocket = await connect(accessToken("DOCTOR", mehta));
    const seen = Promise.all([next(staff, "schedule:updated"), next(raoSocket, "schedule:updated")]);

    const schedule = { slotDurationMinutes: 15, workingDays: [{ day: 1, sessions: [{ name: "Morning", start: "09:00", end: "12:00" }], breaks: [] }] };
    let status = 0;
    const quiet = await staysQuiet(mehtaSocket, "schedule:updated", async () => {
      status = (await as("SUPER_ADMIN").put(`/api/v1/doctors/${rao}/schedule`).send(schedule)).status;
    });

    expect(status).toBe(200);
    expect(await seen).toEqual([{ doctorId: rao }, { doctorId: rao }]);
    expect(quiet).toBe(true);
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

    const mehtaQuiet = await staysQuiet(mehtaSocket, "appointment:created", () => book(rao));

    expect(await raoEvent).toMatchObject({ doctorId: rao });
    expect(mehtaQuiet).toBe(true);
  });

  it("announces edits, arrivals, completions and cancellations", async () => {
    const staff = await connect(accessToken("RECEPTIONIST"));
    const doctor = await connect(accessToken("DOCTOR", rao));
    const id = String((await Appointment.create({ patientId, doctorId: rao, departmentId: new Types.ObjectId(), date: today(), slotStart: "09:00", slotEnd: "09:15", purpose: "Fever" }))._id);
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

    let status = 0;
    const quiet = await staysQuiet(staff, "appointment:created", async () => {
      status = (await book(rao)).status;
    });
    expect(status).toBe(409);
    expect(quiet).toBe(true);
  });
});
