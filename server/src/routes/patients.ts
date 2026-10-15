import { Router } from "express";
import { searchPatientsHandler } from "../controllers/patientController";
import { authenticate } from "../middlewares/authenticate";
import { frontDesk } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { patientSearchSchema } from "../validators/patient";

export const patientRoutes = Router();

patientRoutes.get("/", authenticate, frontDesk, validate(patientSearchSchema, "query"), searchPatientsHandler);
