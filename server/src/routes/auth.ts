import { Router } from "express";
import { loginHandler, logoutHandler, refreshHandler } from "../controllers/authController";
import { loginLimiter } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import { loginSchema } from "../validators/auth";

export const authRoutes = Router();

authRoutes.post("/login", loginLimiter, validate(loginSchema), loginHandler);
authRoutes.post("/refresh", refreshHandler);
authRoutes.post("/logout", logoutHandler);
