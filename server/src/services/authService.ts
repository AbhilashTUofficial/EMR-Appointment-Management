import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { BCRYPT_ROUNDS } from "../config/security";
import { RefreshToken } from "../models/refreshToken";
import { User, type Role } from "../models/user";
import { AppError, unauthorized } from "../utils/AppError";
import { verifyToken } from "../utils/jwt";
import { logAudit } from "./auditService";

const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

type UserForToken = { _id: Types.ObjectId; name: string; email: string; role: Role };

const publicUser = (user: UserForToken) => ({ id: user._id, name: user.name, email: user.email, role: user.role });

async function issueTokens(user: UserForToken) {
  const subject = String(user._id);
  const accessToken = jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, { subject, expiresIn: ACCESS_TTL_SECONDS });
  const refreshToken = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject,
    expiresIn: REFRESH_TTL_SECONDS,
    jwtid: randomUUID(),
  });
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return { accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email }).select("+passwordHash");
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordMatches || !user.isActive) {
    await logAudit({ action: "LOGIN_FAILED", metadata: { email } });
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const tokens = await issueTokens(user);
  await logAudit({ userId: user._id, role: user.role, action: "LOGIN", entityType: "User", entityId: user._id });
  return { user: publicUser(user), ...tokens };
}

// Each refresh token works once: it is deleted when used and a new one is issued.
export async function refresh(token?: string) {
  if (!token) throw unauthorized();

  const payload = verifyToken(token, env.JWT_REFRESH_SECRET);

  // Atomic, so two simultaneous refreshes with the same token can't both succeed.
  const stored = await RefreshToken.findOneAndDelete({ tokenHash: sha256(token) });
  if (!stored) {
    // A valid token that is no longer stored was already used: treat it as stolen and end every session.
    await RefreshToken.deleteMany({ userId: payload.sub });
    throw unauthorized();
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw unauthorized();

  return { user: publicUser(user), ...(await issueTokens(user)) };
}

export async function logout(token?: string) {
  if (!token) return;
  const stored = await RefreshToken.findOneAndDelete({ tokenHash: sha256(token) });
  if (!stored) return;

  const user = await User.findById(stored.userId).select("role");
  await logAudit({ userId: stored.userId, role: user?.role, action: "LOGOUT", entityType: "User", entityId: stored.userId });
}
