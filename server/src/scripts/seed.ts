import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { BCRYPT_ROUNDS } from "../config/security";
import { Department } from "../models/department";
import { User } from "../models/user";

// Safe to run repeatedly: existing departments and users are left alone.

type Range = [name: string, start: string, end: string];

const weeklySchedule = (days: number[], sessions: Range[], breaks: Range[] = []) =>
  days.map((day) => ({
    day,
    sessions: sessions.map(([name, start, end]) => ({ name, start, end })),
    breaks: breaks.map(([name, start, end]) => ({ name, start, end })),
  }));

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
    department: "General Medicine",
    slotDurationMinutes: 15,
    workingDays: weeklySchedule(
      [1, 2, 3, 4, 5, 6],
      [["Morning", "09:00", "12:00"], ["Evening", "13:00", "17:00"]],
      [["Lunch Break", "12:00", "13:00"]],
    ),
  },
  {
    name: "Dr. Vikram Mehta",
    email: "vikram.mehta@emr.test",
    department: "Cardiology",
    slotDurationMinutes: 30,
    workingDays: weeklySchedule(
      [1, 2, 3, 4, 5],
      [["Morning", "10:00", "13:00"], ["Afternoon", "14:00", "16:00"]],
      [["Tea Break", "10:30", "10:45"]],
    ),
  },
  {
    name: "Dr. Sara Thomas",
    email: "sara.thomas@emr.test",
    department: "Pediatrics",
    slotDurationMinutes: 20,
    workingDays: weeklySchedule([1, 3, 5], [["Morning", "09:00", "13:00"]]),
  },
];

async function seed() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo accounts in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set SEED_PASSWORD (min 8 characters) in server/.env");

  await connectDb();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  for (const d of departments) await Department.updateOne({ code: d.code }, d, { upsert: true });
  const departmentIds = Object.fromEntries((await Department.find()).map((d) => [d.name, d._id]));

  const users = [
    { name: "Super Admin", email: "admin@emr.test", role: "SUPER_ADMIN" as const },
    { name: "Riya Sharma", email: "reception@emr.test", role: "RECEPTIONIST" as const },
    ...doctors.map(({ department, slotDurationMinutes, workingDays, ...doctor }) => ({
      ...doctor,
      role: "DOCTOR" as const,
      doctorProfile: {
        departmentId: departmentIds[department],
        slotDurationMinutes,
        workingDays,
      },
    })),
  ];

  for (const user of users) {
    if (await User.exists({ email: user.email })) continue;
    await User.create({ ...user, passwordHash });
    console.log(`created ${user.role.padEnd(12)} ${user.email}`);
  }
  console.log("Seed finished");
}

seed()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
