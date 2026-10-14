import { Router } from "express";
import { sendSuccess } from "../utils/response";
import { authRoutes } from "./auth";
import { departmentRoutes } from "./departments";
import { doctorRoutes } from "./doctors";
import { receptionistRoutes } from "./receptionists";
import { slotRoutes } from "./slots";

export const routes = Router();

routes.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});

routes.use("/auth", authRoutes);
routes.use("/departments", departmentRoutes);
routes.use("/doctors", doctorRoutes);
routes.use("/receptionists", receptionistRoutes);
routes.use("/slots", slotRoutes);
