import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { Appointment } from "../src/models/appointment";
import { User } from "../src/models/user";
import { generateSchedule, getSlots } from "../src/services/slotService";
import { clinicNow } from "../src/utils/time";
import { accessToken, useTestDb } from "./helpers";

useTestDb();

const range = (start: string, end: string, name = "Morning") => ({ name, start, end });
const profile = (sessions: ReturnType<typeof range>[], breaks: ReturnType<typeof range>[] = [], slotDurationMinutes = 15) => ({
  slotDurationMinutes,
  workingDays: [{ day: 1, sessions, breaks }], // Mondays
});

const MONDAY = "2030-01-07";
const TUESDAY = "2030-01-08";
const starts = (schedule: ReturnType<typeof generateSchedule>) => schedule.sessions.flatMap((s) => s.slots.map((slot) => slot.start));

describe("generateSchedule", () => {
  it("splits a session into slots of the chosen length", () => {
    const schedule = generateSchedule(profile([range("09:00", "10:00")]), MONDAY);
    expect(starts(schedule)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    expect(schedule.sessions[0].slots[3]).toEqual({ start: "09:45", end: "10:00" });
  });

  it("leaves out the gap between two sessions, as in the assessment example", () => {
    const schedule = generateSchedule(
      profile([range("09:00", "12:00"), range("13:00", "17:00", "Evening")], [range("12:00", "13:00", "Lunch")]),
      MONDAY,
    );
    expect(schedule.sessions.map((s) => s.slots.length)).toEqual([12, 16]);
    expect(starts(schedule)).not.toContain("12:00");
    expect(starts(schedule)).not.toContain("12:45");
    expect(schedule.sessions[1].slots[0].start).toBe("13:00");
    expect(schedule.breaks).toEqual([range("12:00", "13:00", "Lunch")]);
  });

  it("removes the slots that fall inside a break within a session", () => {
    const schedule = generateSchedule(profile([range("09:00", "12:00")], [range("10:30", "10:45", "Tea")]), MONDAY);
    expect(starts(schedule)).not.toContain("10:30");
    expect(starts(schedule)).toContain("10:15");
    expect(starts(schedule)).toContain("10:45");
  });

  it("removes every slot a break touches, even when the break isn't on the slot grid", () => {
    const schedule = generateSchedule(profile([range("09:00", "12:00")], [range("10:40", "10:50")]), MONDAY);
    expect(starts(schedule)).not.toContain("10:30");
    expect(starts(schedule)).not.toContain("10:45");
    expect(starts(schedule)).toContain("10:15");
    expect(starts(schedule)).toContain("11:00");
  });

  it("drops leftover time that is shorter than a slot", () => {
    const schedule = generateSchedule(profile([range("09:00", "09:50")]), MONDAY);
    expect(starts(schedule)).toEqual(["09:00", "09:15", "09:30"]);
  });

  it("gives no slots when the slot is longer than the session", () => {
    const schedule = generateSchedule(profile([range("09:00", "09:20")], [], 30), MONDAY);
    expect(schedule.isWorkingDay).toBe(true);
    expect(starts(schedule)).toEqual([]);
  });

  it("is not a working day on days the doctor doesn't work", () => {
    expect(generateSchedule(profile([range("09:00", "10:00")]), TUESDAY)).toEqual({ isWorkingDay: false, sessions: [], breaks: [] });
  });

  it("returns sessions in time order whatever order they were saved in", () => {
    const schedule = generateSchedule(profile([range("13:00", "14:00", "Evening"), range("09:00", "10:00")]), MONDAY);
    expect(schedule.sessions.map((s) => s.name)).toEqual(["Morning", "Evening"]);
  });

  it("never produces overlapping slots or slots outside a session", () => {
    const schedule = generateSchedule(
      profile([range("08:30", "12:10"), range("12:10", "15:00", "Afternoon")], [range("10:00", "10:20"), range("13:05", "13:25")], 20),
      MONDAY,
    );
    const all = schedule.sessions.flatMap((s) => s.slots.map((slot) => ({ ...slot, session: s })));
    for (let i = 1; i < all.length; i++) expect(all[i].start >= all[i - 1].end).toBe(true);
    for (const slot of all) {
      expect(slot.start >= slot.session.start && slot.end <= slot.session.end).toBe(true);
    }
  });

  it("reads the weekday from the date itself, so the server's timezone can't shift it", () => {
    expect(new Date(`${MONDAY}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(generateSchedule(profile([range("09:00", "10:00")]), MONDAY).isWorkingDay).toBe(true);
  });
});

describe("clinicNow", () => {
  it("converts an instant to the clinic's date and time", () => {
    expect(clinicNow("Asia/Kolkata", new Date("2026-10-14T18:45:00Z"))).toEqual({ date: "2026-10-15", time: "00:15" });
    expect(clinicNow("UTC", new Date("2026-10-14T18:45:00Z"))).toEqual({ date: "2026-10-14", time: "18:45" });
  });

  it("shows midnight as 00:00, not 24:00", () => {
    expect(clinicNow("Asia/Kolkata", new Date("2026-10-14T18:30:00Z"))).toEqual({ date: "2026-10-15", time: "00:00" });
  });
});

describe("getSlots", () => {
  let doctorId: string;

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Appointment.deleteMany({})]);
    const doctor = await User.create({
      name: "Dr. Slots",
      email: "slots@emr.test",
      passwordHash: "x",
      role: "DOCTOR",
      doctorProfile: { departmentId: new Types.ObjectId(), ...profile([range("09:00", "10:00")]) },
    });
    doctorId = String(doctor._id);
  });

  const book = (slotStart: string, extra = {}) =>
    Appointment.create({
      patientId: new Types.ObjectId(),
      doctorId,
      departmentId: new Types.ObjectId(),
      date: MONDAY,
      slotStart,
      slotEnd: "09:15",
      ...extra,
    });
  const statuses = async (now: { date: string; time: string }) =>
    (await getSlots(doctorId, MONDAY, now)).sessions.flatMap((s) => s.slots.map((slot) => slot.status));

  it("offers every slot on a future day", async () => {
    expect(await statuses({ date: "2030-01-01", time: "12:00" })).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "AVAILABLE"]);
  });

  it("marks slots that have already started as past, on the day itself", async () => {
    expect(await statuses({ date: MONDAY, time: "09:20" })).toEqual(["PAST", "PAST", "AVAILABLE", "AVAILABLE"]);
    expect(await statuses({ date: MONDAY, time: "09:30" })).toEqual(["PAST", "PAST", "PAST", "AVAILABLE"]);
    expect(await statuses({ date: MONDAY, time: "08:00" })).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "AVAILABLE"]);
  });

  it("marks every slot as past on an earlier day", async () => {
    expect(await statuses({ date: TUESDAY, time: "00:00" })).toEqual(["PAST", "PAST", "PAST", "PAST"]);
  });

  it("shows booked slots as booked, with the appointment id, even after they have passed", async () => {
    const appointment = await book("09:15");
    const future = (await getSlots(doctorId, MONDAY, { date: "2030-01-01", time: "12:00" })).sessions[0].slots;
    expect(future[1]).toMatchObject({ start: "09:15", status: "BOOKED", appointmentId: appointment._id });
    expect(await statuses({ date: TUESDAY, time: "00:00" })).toEqual(["PAST", "BOOKED", "PAST", "PAST"]);
  });

  it("offers a slot again once its appointment is cancelled", async () => {
    await book("09:30", { status: "CANCELLED", isActive: false });
    expect(await statuses({ date: "2030-01-01", time: "12:00" })).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "AVAILABLE"]);
  });

  it("returns 404 for an unknown or inactive doctor", async () => {
    await expect(getSlots("64b000000000000000000000", MONDAY)).rejects.toMatchObject({ status: 404 });
    await User.updateOne({ _id: doctorId }, { isActive: false });
    await expect(getSlots(doctorId, MONDAY)).rejects.toMatchObject({ status: 404 });
  });
});

describe("GET /slots", () => {
  let doctorId: string;
  let otherDoctorId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    const make = (email: string) =>
      User.create({
        name: "Dr. Api",
        email,
        passwordHash: "x",
        role: "DOCTOR",
        doctorProfile: { departmentId: new Types.ObjectId(), ...profile([range("09:00", "10:00")]) },
      });
    doctorId = String((await make("a@emr.test"))._id);
    otherDoctorId = String((await make("b@emr.test"))._id);
  });

  const get = (token: string, query: string) => request(app).get(`/api/v1/slots?${query}`).set("Authorization", `Bearer ${token}`);

  it("returns the day's sessions, slots and today's date for staff", async () => {
    const res = await get(accessToken("RECEPTIONIST"), `doctorId=${doctorId}&date=${MONDAY}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isWorkingDay).toBe(true);
    expect(res.body.data.sessions[0].slots).toHaveLength(4);
    expect(res.body.meta.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("says when the doctor does not work that day", async () => {
    const res = await get(accessToken("SUPER_ADMIN"), `doctorId=${doctorId}&date=${TUESDAY}`);
    expect(res.body.data).toEqual({ isWorkingDay: false, sessions: [], breaks: [] });
  });

  it("lets a doctor see their own slots but not another doctor's", async () => {
    expect((await get(accessToken("DOCTOR", doctorId), `doctorId=${doctorId}&date=${MONDAY}`)).status).toBe(200);
    expect((await get(accessToken("DOCTOR", doctorId), `doctorId=${otherDoctorId}&date=${MONDAY}`)).status).toBe(404);
  });

  it("needs a signed-in user", async () => {
    expect((await request(app).get(`/api/v1/slots?doctorId=${doctorId}&date=${MONDAY}`)).status).toBe(401);
  });

  it.each([
    ["a missing doctor", `date=${MONDAY}`],
    ["a malformed doctor id", `doctorId=nope&date=${MONDAY}`],
    ["a missing date", "doctorId=64b000000000000000000000"],
    ["an impossible date", "doctorId=64b000000000000000000000&date=2030-13-45"],
    ["a date in the wrong format", "doctorId=64b000000000000000000000&date=07-01-2030"],
  ])("rejects %s", async (_name, query) => {
    expect((await get(accessToken("RECEPTIONIST"), query)).status).toBe(400);
  });

  it("returns 404 for a doctor that doesn't exist", async () => {
    expect((await get(accessToken("RECEPTIONIST"), `doctorId=64b000000000000000000000&date=${MONDAY}`)).status).toBe(404);
  });
});
