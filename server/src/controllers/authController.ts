import type { Request, RequestHandler, Response } from "express";
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

// cookie-parser can turn a crafted cookie into an object, so only accept plain strings.
const refreshTokenFrom = (req: Request): string | undefined => {
  const value = req.cookies[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
};

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: REFRESH_TTL_SECONDS * 1000 });

export const loginHandler: RequestHandler = async (req, res) => {
  const { user, accessToken, refreshToken } = await login(req.body.email, req.body.password);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { user, accessToken }, "Logged in");
};

export const refreshHandler: RequestHandler = async (req, res) => {
  const { user, accessToken, refreshToken } = await refresh(refreshTokenFrom(req));
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { user, accessToken }, "Token refreshed");
};

export const logoutHandler: RequestHandler = async (req, res) => {
  await logout(refreshTokenFrom(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  sendSuccess(res, null, "Logged out");
};
