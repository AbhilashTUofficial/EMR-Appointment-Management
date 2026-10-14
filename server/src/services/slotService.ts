import { env } from "../config/env";
import { Appointment } from "../models/appointment";
import { User } from "../models/user";
import { AppError } from "../utils/AppError";
import { clinicNow, rangesOverlap, toHHMM, toMinutes } from "../utils/time";

type Range = { name?: string | null; start: string; end: string };
type Profile = { slotDurationMinutes: number; workingDays: { day: number; sessions: Range[]; breaks: Range[] }[] };

const byStart = (a: Range, b: Range) => toMinutes(a.start) - toMinutes(b.start);

// The slots a doctor offers on a date, worked out from their schedule. Nothing is stored.
// Slots start at the beginning of each session, and any slot that touches a break is left out.
export function generateSchedule(profile: Profile, date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, read as UTC so the server's timezone can't shift it
  const day = profile.workingDays.find((d) => d.day === weekday);
  if (!day) return { isWorkingDay: false, sessions: [], breaks: [] };

  const length = profile.slotDurationMinutes;
  const sessions = [...day.sessions].sort(byStart).map((session) => {
    const slots = [];
    for (let start = toMinutes(session.start); start + length <= toMinutes(session.end); start += length) {
      const slot = { start: toHHMM(start), end: toHHMM(start + length) };
      if (!day.breaks.some((b) => rangesOverlap(slot, b))) slots.push(slot);
    }
    return { name: session.name, start: session.start, end: session.end, slots };
  });

  return { isWorkingDay: true, sessions, breaks: [...day.breaks].sort(byStart) };
}

type Now = ReturnType<typeof clinicNow>;
type Booking = { slotStart: string; _id: unknown };
type Slot = { start: string; end: string; status: "AVAILABLE" | "BOOKED" | "PAST"; appointmentId?: unknown };
type DaySlots = {
  isWorkingDay: boolean;
  sessions: { name?: string | null; start: string; end: string; slots: Slot[] }[];
  breaks: Range[];
  today: string;
};

export async function getSlots(doctorId: string, date: string, now: Now = clinicNow(env.CLINIC_TIMEZONE)): Promise<DaySlots> {
  const doctor = await User.findOne({ _id: doctorId, role: "DOCTOR", isActive: true }).lean();
  if (!doctor?.doctorProfile) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  const schedule = generateSchedule(doctor.doctorProfile, date);
  if (!schedule.isWorkingDay) return { isWorkingDay: false, sessions: [], breaks: [], today: now.date };

  // Same filter as the unique slot index, so this is an index lookup.
  const booked: Booking[] = await Appointment.find({ doctorId, date, isActive: true }).select("slotStart").lean();
  const bookingFor = (start: string) => booked.find((b) => b.slotStart === start);
  const hasPassed = (start: string) => date < now.date || (date === now.date && start <= now.time);

  const sessions = schedule.sessions.map((session) => ({
    ...session,
    slots: session.slots.map((slot): Slot => {
      const booking = bookingFor(slot.start);
      if (booking) return { ...slot, status: "BOOKED", appointmentId: booking._id };
      return { ...slot, status: hasPassed(slot.start) ? "PAST" : "AVAILABLE" };
    }),
  }));

  return { ...schedule, sessions, today: now.date };
}
