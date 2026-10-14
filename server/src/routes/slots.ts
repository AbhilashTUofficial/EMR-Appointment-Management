import { Router } from "express";
import { getSlotsHandler } from "../controllers/slotController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

export const slotRoutes = Router();

slotRoutes.get("/", authenticate, authorize("SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"), getSlotsHandler);
