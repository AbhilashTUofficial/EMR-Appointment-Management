import type { WorkingDay } from "./api/doctors";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The week is shown Monday to Sunday.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const summarizeDays = (workingDays: WorkingDay[]) =>
  WEEK_ORDER.filter((day) => workingDays.some((d) => d.day === day))
    .map((day) => DAY_NAMES[day].slice(0, 3))
    .join(", ") || "No working days";
