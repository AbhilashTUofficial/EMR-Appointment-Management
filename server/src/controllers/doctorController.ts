import type { RequestHandler } from "express";
import { createDoctor, listDoctors, updateSchedule } from "../services/doctorService";
import { parsedQuery } from "../middlewares/validate";
import { sendSuccess } from "../utils/response";
import type { DoctorQuery } from "../validators/doctor";

export const listDoctorsHandler: RequestHandler = async (req, res) => {
  const { departmentId } = parsedQuery<DoctorQuery>(res);
  sendSuccess(res, await listDoctors(req.user!, departmentId));
};

export const createDoctorHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await createDoctor(req.body, req.user!), "Doctor created", 201);
};

export const updateScheduleHandler: RequestHandler = async (req, res) => {
  sendSuccess(res, await updateSchedule(String(req.params.id), req.body, req.user!), "Schedule updated");
};
