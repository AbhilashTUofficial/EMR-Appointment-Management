import type { RequestHandler } from "express";
import { searchPatients } from "../services/patientService";
import { parsedQuery } from "../middlewares/validate";
import { sendSuccess } from "../utils/response";
import type { PatientSearch } from "../validators/patient";

export const searchPatientsHandler: RequestHandler = async (req, res) => {
  const { search } = parsedQuery<PatientSearch>(res);
  sendSuccess(res, await searchPatients(search));
};
