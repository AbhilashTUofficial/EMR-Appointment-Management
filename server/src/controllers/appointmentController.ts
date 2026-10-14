import type { RequestHandler } from "express";
import { createAppointment } from "../services/appointmentService";
import { sendSuccess } from "../utils/response";

export const createAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await createAppointment(req.body, req.user!), "Appointment created", 201);
};
