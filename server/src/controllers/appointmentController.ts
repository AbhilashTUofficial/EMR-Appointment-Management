import type { RequestHandler } from "express";
import { changeStatus, createAppointment, getAppointment, listAppointments, updateAppointment } from "../services/appointmentService";
import { sendSuccess } from "../utils/response";
import { listAppointmentsSchema } from "../validators/appointment";

export const createAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await createAppointment(req.body, req.user!), "Appointment created", 201);
};

export const listAppointmentsHandler: RequestHandler = async (req, res) => {
  const { items, meta } = await listAppointments(listAppointmentsSchema.parse(req.query), req.user!);
  sendSuccess(res, items, "OK", 200, meta);
};

export const getAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await getAppointment(String(req.params.id), req.user!));
};

export const updateAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await updateAppointment(String(req.params.id), req.body, req.user!), "Appointment updated");
};

export const cancelAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await changeStatus(String(req.params.id), "CANCELLED", req.user!), "Appointment cancelled");
};

export const arriveAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await changeStatus(String(req.params.id), "ARRIVED", req.user!), "Patient marked as arrived");
};

export const completeAppointmentHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await changeStatus(String(req.params.id), "COMPLETED", req.user!), "Appointment completed");
};
