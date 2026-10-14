import { http } from "./http";

export type Slot = { start: string; end: string; status: "AVAILABLE" | "BOOKED" | "PAST"; appointmentId?: string };
export type SlotSession = { name?: string; start: string; end: string; slots: Slot[] };
export type BreakRange = { name?: string; start: string; end: string };
export type DaySlots = { isWorkingDay: boolean; sessions: SlotSession[]; breaks: BreakRange[] };

export const getSlots = async (doctorId: string, date: string) =>
  (await http<DaySlots>(`/slots?doctorId=${doctorId}&date=${date}`)).data;
