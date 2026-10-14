import type { RequestHandler } from "express";
import { getSlots } from "../services/slotService";
import { AppError } from "../utils/AppError";
import { sendSuccess } from "../utils/response";
import { slotQuerySchema } from "../validators/slot";

export const getSlotsHandler: RequestHandler = async (req, res) => {
  const { doctorId, date } = slotQuerySchema.parse(req.query);

  // A doctor can only look at their own schedule; the same answer as for a missing doctor avoids confirming who exists.
  if (req.user!.role === "DOCTOR" && req.user!.id !== doctorId) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor not found");

  sendSuccess(res, await getSlots(doctorId, date));
};
