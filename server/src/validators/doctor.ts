import { z } from "zod";
import { HHMM } from "../utils/patterns";
import { rangesOverlap, toMinutes } from "../utils/time";
import { objectId } from "./common";
import { createStaffSchema } from "./staff";

export const createDoctorSchema = createStaffSchema.extend({
  departmentId: objectId,
  specialization: z.string().trim().max(100).optional(),
});

const time = z.string().regex(HHMM, "Use HH:mm");

const timeRange = z
  .object({ name: z.string().trim().min(1, "Enter a name").max(50), start: time, end: time })
  .refine((r) => toMinutes(r.start) < toMinutes(r.end), { message: "End must be after start", path: ["end"] });

const hasOverlap = (ranges: { start: string; end: string }[]) =>
  ranges.some((a, i) => ranges.slice(i + 1).some((b) => rangesOverlap(a, b)));

const workingDay = z
  .object({
    day: z.number().int().min(0).max(6), // 0 = Sunday
    sessions: z.array(timeRange).min(1, "Add at least one session"),
    breaks: z.array(timeRange),
  })
  .refine((d) => !hasOverlap(d.sessions), { message: "Sessions overlap", path: ["sessions"] })
  .refine((d) => !hasOverlap(d.breaks), { message: "Breaks overlap", path: ["breaks"] });

export const scheduleSchema = z
  .object({
    slotDurationMinutes: z.number().int().min(5).max(120),
    workingDays: z.array(workingDay).max(7),
  })
  .refine((s) => new Set(s.workingDays.map((d) => d.day)).size === s.workingDays.length, {
    message: "A day appears more than once",
    path: ["workingDays"],
  })
  // A shorter session would produce no slots at all.
  .refine((s) => s.workingDays.every((d) => d.sessions.every((r) => toMinutes(r.end) - toMinutes(r.start) >= s.slotDurationMinutes)), {
    message: "Every session must be at least one slot long",
    path: ["workingDays"],
  });

export const doctorQuerySchema = z.object({ departmentId: objectId.optional() });

export type DoctorQuery = z.infer<typeof doctorQuerySchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
