import { Router } from "express";
import { getSlotsHandler } from "../controllers/slotController";
import { authenticate } from "../middlewares/authenticate";
import { anyStaff } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { slotQuerySchema } from "../validators/slot";

export const slotRoutes = Router();

slotRoutes.get("/", authenticate, anyStaff, validate(slotQuerySchema, "query"), getSlotsHandler);
