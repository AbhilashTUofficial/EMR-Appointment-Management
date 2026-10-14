import { Router } from "express";
import { searchPatientsHandler } from "../controllers/patientController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

export const patientRoutes = Router();

patientRoutes.get("/", authenticate, authorize("SUPER_ADMIN", "RECEPTIONIST"), searchPatientsHandler);
