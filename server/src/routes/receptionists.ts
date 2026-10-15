import { Router } from "express";
import { createReceptionistHandler } from "../controllers/receptionistController";
import { authenticate } from "../middlewares/authenticate";
import { adminOnly } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { createStaffSchema } from "../validators/staff";

export const receptionistRoutes = Router();

receptionistRoutes.post("/", authenticate, adminOnly, validate(createStaffSchema), createReceptionistHandler);
