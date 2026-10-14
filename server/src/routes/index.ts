import { Router } from "express";
import { sendSuccess } from "../utils/response";
import { appointmentRoutes } from "./appointments";
import { authRoutes } from "./auth";
import { dashboardRoutes } from "./dashboard";
import { departmentRoutes } from "./departments";
import { doctorRoutes } from "./doctors";
import { patientRoutes } from "./patients";
import { receptionistRoutes } from "./receptionists";
import { slotRoutes } from "./slots";

export const routes = Router();

routes.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});

routes.use("/auth", authRoutes);
routes.use("/dashboard", dashboardRoutes);
routes.use("/departments", departmentRoutes);
routes.use("/doctors", doctorRoutes);
routes.use("/patients", patientRoutes);
routes.use("/appointments", appointmentRoutes);
routes.use("/receptionists", receptionistRoutes);
routes.use("/slots", slotRoutes);
