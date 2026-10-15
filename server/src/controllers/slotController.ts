import type { RequestHandler } from "express";
import { parsedQuery } from "../middlewares/validate";
import { getSlots } from "../services/slotService";
import { sendSuccess } from "../utils/response";
import type { SlotQuery } from "../validators/slot";

export const getSlotsHandler: RequestHandler = async (req, res) => {
  const { doctorId, date } = parsedQuery<SlotQuery>(res);
  sendSuccess(res, await getSlots(req.user!, doctorId, date));
};
