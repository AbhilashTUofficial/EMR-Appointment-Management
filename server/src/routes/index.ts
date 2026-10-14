import { Router } from "express";
import { sendSuccess } from "../utils/response";
import { authRoutes } from "./auth";

export const routes = Router();

routes.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});

routes.use("/auth", authRoutes);
