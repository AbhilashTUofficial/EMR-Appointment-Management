import { Router } from "express";
import { listDepartmentsHandler } from "../controllers/departmentController";
import { authenticate } from "../middlewares/authenticate";

export const departmentRoutes = Router();

departmentRoutes.get("/", authenticate, listDepartmentsHandler);
