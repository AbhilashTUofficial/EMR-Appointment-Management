import { Router } from "express";
import { sendSuccess } from "../utils/response";

export const routes = Router();

routes.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});
