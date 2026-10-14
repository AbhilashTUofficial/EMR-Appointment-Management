import type { RequestHandler } from "express";
import { createStaff } from "../services/userService";
import { sendSuccess } from "../utils/response";

export const createReceptionistHandler: RequestHandler = async (req, res) => {
  const user = await createStaff({ ...req.body, role: "RECEPTIONIST" }, req.user!.id);
  sendSuccess(res, { id: user._id, name: user.name, email: user.email, role: user.role }, "Receptionist created", 201);
};
