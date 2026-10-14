import type { RequestHandler } from "express";
import { listDepartments } from "../services/departmentService";
import { sendSuccess } from "../utils/response";

export const listDepartmentsHandler: RequestHandler = async (_req, res) => {
  sendSuccess(res, await listDepartments());
};
