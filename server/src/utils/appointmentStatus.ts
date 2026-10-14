import type { AppointmentStatus } from "../models/appointment";

// SCHEDULED -> ARRIVED -> COMPLETED, or SCHEDULED -> CANCELLED. Completed and cancelled are final.
const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) => transitions[from].includes(to);
