import type { RequestHandler } from "express";
import { getSummary } from "../services/dashboardService";
import { sendSuccess } from "../utils/response";

export const summaryHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await getSummary(req.user!));
};
