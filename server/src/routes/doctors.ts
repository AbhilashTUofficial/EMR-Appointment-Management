import { Router } from "express";
import { createDoctorHandler, listDoctorsHandler, updateScheduleHandler } from "../controllers/doctorController";
import { authenticate } from "../middlewares/authenticate";
import { adminOnly, anyStaff } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common";
import { createDoctorSchema, doctorQuerySchema, scheduleSchema } from "../validators/doctor";

export const doctorRoutes = Router();

doctorRoutes.use(authenticate);
doctorRoutes.get("/", anyStaff, validate(doctorQuerySchema, "query"), listDoctorsHandler);
doctorRoutes.post("/", adminOnly, validate(createDoctorSchema), createDoctorHandler);
doctorRoutes.put("/:id/schedule", adminOnly, validate(idParams, "params"), validate(scheduleSchema), updateScheduleHandler);
