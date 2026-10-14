import { Router } from "express";
import { summaryHandler } from "../controllers/dashboardController";
import { authenticate } from "../middlewares/authenticate";

export const dashboardRoutes = Router();

dashboardRoutes.get("/summary", authenticate, summaryHandler);
