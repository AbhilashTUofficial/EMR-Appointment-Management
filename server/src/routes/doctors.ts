import { Router } from "express";
import { createDoctorHandler, listDoctorsHandler, updateScheduleHandler } from "../controllers/doctorController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common";
import { createDoctorSchema, scheduleSchema } from "../validators/doctor";

export const doctorRoutes = Router();

doctorRoutes.use(authenticate);
doctorRoutes.get("/", authorize("SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"), listDoctorsHandler);
doctorRoutes.post("/", authorize("SUPER_ADMIN"), validate(createDoctorSchema), createDoctorHandler);
doctorRoutes.put("/:id/schedule", authorize("SUPER_ADMIN"), validate(idParams, "params"), validate(scheduleSchema), updateScheduleHandler);
