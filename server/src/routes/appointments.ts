import { Router } from "express";
import { createAppointmentHandler } from "../controllers/appointmentController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { createAppointmentSchema } from "../validators/appointment";

export const appointmentRoutes = Router();

appointmentRoutes.use(authenticate);
appointmentRoutes.post("/", authorize("SUPER_ADMIN", "RECEPTIONIST"), validate(createAppointmentSchema), createAppointmentHandler);
