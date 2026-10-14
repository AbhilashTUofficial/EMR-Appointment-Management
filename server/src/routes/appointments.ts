import { Router } from "express";
import {
  arriveAppointmentHandler,
  cancelAppointmentHandler,
  completeAppointmentHandler,
  createAppointmentHandler,
  getAppointmentHandler,
  listAppointmentsHandler,
  updateAppointmentHandler,
} from "../controllers/appointmentController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common";
import { createAppointmentSchema, updateAppointmentSchema } from "../validators/appointment";

export const appointmentRoutes = Router();

const frontDesk = authorize("SUPER_ADMIN", "RECEPTIONIST");
const anyStaff = authorize("SUPER_ADMIN", "RECEPTIONIST", "DOCTOR");
const checkId = validate(idParams, "params");

appointmentRoutes.use(authenticate);
appointmentRoutes.post("/", frontDesk, validate(createAppointmentSchema), createAppointmentHandler);
appointmentRoutes.get("/", anyStaff, listAppointmentsHandler);
appointmentRoutes.get("/:id", anyStaff, checkId, getAppointmentHandler);
appointmentRoutes.put("/:id", anyStaff, checkId, validate(updateAppointmentSchema), updateAppointmentHandler);
appointmentRoutes.delete("/:id", frontDesk, checkId, cancelAppointmentHandler);
appointmentRoutes.post("/:id/arrive", frontDesk, checkId, arriveAppointmentHandler);
appointmentRoutes.post("/:id/complete", authorize("DOCTOR"), checkId, completeAppointmentHandler);
