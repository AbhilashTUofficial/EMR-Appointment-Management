import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { Department } from "../models/department";
import { User } from "../models/user";

// Safe to run repeatedly: existing departments and users are left alone.

const weekdays = [1, 2, 3, 4, 5];
const sixDays = [1, 2, 3, 4, 5, 6];

const day = (d: number, sessions: [string, string][], breaks: [string, string][] = []) => ({
  day: d,
  sessions: sessions.map(([start, end], i) => ({ name: i === 0 ? "Morning" : "Evening", start, end })),
  breaks: breaks.map(([start, end]) => ({ name: "Break", start, end })),
});

const departments = [
  { name: "General Medicine", code: "GEN" },
  { name: "Cardiology", code: "CAR" },
  { name: "Pediatrics", code: "PED" },
  { name: "Orthopedics", code: "ORT" },
];

const doctors = [
  {
    name: "Dr. Anita Rao",
    email: "anita.rao@emr.test",
    dept: "GEN",
    slot: 15,
    days: sixDays.map((d) => day(d, [["09:00", "12:00"], ["13:00", "17:00"]], [["12:00", "13:00"]])),
  },
  {
    name: "Dr. Vikram Mehta",
    email: "vikram.mehta@emr.test",
    dept: "CAR",
    slot: 30,
    days: weekdays.map((d) => day(d, [["10:00", "13:00"], ["14:00", "16:00"]], [["10:30", "10:45"]])),
  },
  {
    name: "Dr. Sara Thomas",
    email: "sara.thomas@emr.test",
    dept: "PED",
    slot: 20,
    days: [1, 3, 5].map((d) => day(d, [["09:00", "13:00"]])),
  },
];

async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set SEED_PASSWORD (min 8 characters) in server/.env");

  await connectDb();
  const passwordHash = await bcrypt.hash(password, 12);

  for (const d of departments) await Department.updateOne({ code: d.code }, d, { upsert: true });
  const deptId = Object.fromEntries((await Department.find()).map((d) => [d.code, d._id]));

  const users = [
    { name: "Super Admin", email: "admin@emr.test", role: "SUPER_ADMIN" as const },
    { name: "Riya Sharma", email: "reception@emr.test", role: "RECEPTIONIST" as const },
    ...doctors.map((d) => ({
      name: d.name,
      email: d.email,
      role: "DOCTOR" as const,
      doctorProfile: {
        departmentId: deptId[d.dept],
        specialization: departments.find((x) => x.code === d.dept)!.name,
        slotDurationMinutes: d.slot,
        workingDays: d.days,
      },
    })),
  ];

  for (const u of users) {
    if (await User.exists({ email: u.email })) continue;
    await User.create({ ...u, passwordHash });
    console.log(`created ${u.role.padEnd(12)} ${u.email}`);
  }
  console.log("Seed finished");
}

seed()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
