import { Router } from "express";
import { createReceptionistHandler } from "../controllers/receptionistController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { createStaffSchema } from "../validators/doctor";

export const receptionistRoutes = Router();

receptionistRoutes.post("/", authenticate, authorize("SUPER_ADMIN"), validate(createStaffSchema), createReceptionistHandler);
