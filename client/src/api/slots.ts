import { http } from "./http";
import type { TimeRange } from "./doctors";

export type Slot = { start: string; end: string; status: "AVAILABLE" | "BOOKED" | "PAST"; appointmentId?: string };
export type SlotSession = TimeRange & { slots: Slot[] };
export type DaySlots = { isWorkingDay: boolean; sessions: SlotSession[]; breaks: TimeRange[] };

export const getSlots = async (doctorId: string, date: string) =>
  (await http<DaySlots>(`/slots?${new URLSearchParams({ doctorId, date })}`)).data;
