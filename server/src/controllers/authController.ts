import type { RequestHandler } from "express";
import { env } from "../config/env";
import { REFRESH_TTL_SECONDS, login, logout, refresh } from "../services/authService";
import { sendSuccess } from "../utils/response";

const REFRESH_COOKIE = "refreshToken";

// Scoped to the auth routes so the browser only sends it where it's needed.
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.NODE_ENV === "production",
  path: "/api/v1/auth",
} as const;

export const loginHandler: RequestHandler = async (req, res) => {
  const { user, accessToken, refreshToken } = await login(req.body.email, req.body.password);
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL_SECONDS * 1000 });
  sendSuccess(res, { user, accessToken }, "Logged in");
};

export const refreshHandler: RequestHandler = async (req, res) => {
  const { user, accessToken, refreshToken } = await refresh(req.cookies[REFRESH_COOKIE]);
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL_SECONDS * 1000 });
  sendSuccess(res, { user, accessToken }, "Token refreshed");
};

export const logoutHandler: RequestHandler = async (req, res) => {
  await logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  sendSuccess(res, null, "Logged out");
};
