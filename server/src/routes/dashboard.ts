import { Router } from "express";
import { summaryHandler } from "../controllers/dashboardController";
import { authenticate } from "../middlewares/authenticate";
import { anyStaff } from "../middlewares/authorize";

export const dashboardRoutes = Router();

dashboardRoutes.get("/summary", authenticate, anyStaff, summaryHandler);
