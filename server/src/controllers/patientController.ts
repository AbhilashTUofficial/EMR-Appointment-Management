import type { RequestHandler } from "express";
import { searchPatients } from "../services/patientService";
import { sendSuccess } from "../utils/response";
import { patientSearchSchema } from "../validators/patient";

export const searchPatientsHandler: RequestHandler = async (req, res) => {
  const { search } = patientSearchSchema.parse(req.query);
  sendSuccess(res, await searchPatients(search));
};
