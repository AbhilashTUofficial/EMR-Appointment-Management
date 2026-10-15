import { Router } from "express";
import { listDepartmentsHandler } from "../controllers/departmentController";
import { authenticate } from "../middlewares/authenticate";
import { anyStaff } from "../middlewares/authorize";

export const departmentRoutes = Router();

departmentRoutes.get("/", authenticate, anyStaff, listDepartmentsHandler);
