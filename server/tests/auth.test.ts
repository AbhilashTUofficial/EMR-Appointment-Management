import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { authenticate } from "../src/middlewares/authenticate";
import { authorize } from "../src/middlewares/authorize";
import { errorHandler } from "../src/middlewares/errorHandler";
import { AuditLog } from "../src/models/auditLog";
import { RefreshToken } from "../src/models/refreshToken";
import { User } from "../src/models/user";
import { REFRESH_REUSE_GRACE_MS } from "../src/services/authService";
import { TEST_REFRESH_SECRET, accessToken, useTestDb } from "./helpers";

const PASSWORD = "Passw0rd!123";

useTestDb();

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({}), AuditLog.deleteMany({})]);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await User.create([
    { name: "Admin", email: "admin@emr.test", passwordHash, role: "SUPER_ADMIN" },
    { name: "Reception", email: "reception@emr.test", passwordHash, role: "RECEPTIONIST" },
    { name: "Gone", email: "gone@emr.test", passwordHash, role: "RECEPTIONIST", isActive: false },
  ]);
});

const login = (email = "admin@emr.test", password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const refreshCookie = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("refreshToken="))!;

describe("POST /auth/login", () => {
  it("returns the user and an access token, and sets the refresh token as an httpOnly cookie", async () => {
    const res = await login("Admin@EMR.test");
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: "Admin", email: "admin@emr.test", role: "SUPER_ADMIN" });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(jwt.decode(res.body.data.accessToken)).toMatchObject({ role: "SUPER_ADMIN" });

    const cookie = refreshCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(await RefreshToken.countDocuments()).toBe(1);
  });

  it("gives the same answer for a wrong password, an unknown email and an inactive user", async () => {
    const responses = [
      await login("admin@emr.test", "wrong-password"),
      await login("nobody@emr.test"),
      await login("gone@emr.test"),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
  });

  it("rejects a malformed body", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["email", "password"]);
  });

  it("writes audit entries for successful and failed logins", async () => {
    await login();
    await login("admin@emr.test", "wrong-password");
    const actions = (await AuditLog.find().sort({ createdAt: 1 })).map((a) => a.action);
    expect(actions).toEqual(["LOGIN", "LOGIN_FAILED"]);
  });
});

describe("POST /auth/refresh", () => {
  it("issues new tokens and retires the old refresh token", async () => {
    const first = await login();
    const second = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(first));
    expect(second.status).toBe(200);
    expect(second.body.data.accessToken).toBeTruthy();
    expect(refreshCookie(second)).not.toBe(refreshCookie(first));
    expect(await RefreshToken.countDocuments({ usedAt: null })).toBe(1);

    const oldToken = refreshCookie(first);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", oldToken)).status).toBe(401);
  });

  // Pretends the token was used a while ago, instead of waiting.
  const usedLongAgo = () => RefreshToken.updateMany({ usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - 2 * REFRESH_REUSE_GRACE_MS) });

  it("treats a refresh token replayed long after use as theft: ends every session and writes an audit entry", async () => {
    const first = await login();
    const oldCookie = refreshCookie(first);
    const second = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    await usedLongAgo();

    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: "REFRESH_TOKEN_REUSED" })).toBe(1);

    const afterReplay = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(second));
    expect(afterReplay.status).toBe(401);
  });

  it("turns away the loser of a refresh race (two tabs, same token) without ending the session", async () => {
    const first = await login();
    const cookie = refreshCookie(first);
    const [a, b] = await Promise.all([request(app).post("/api/v1/auth/refresh").set("Cookie", cookie), request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);

    const winner = a.status === 200 ? a : b;
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(winner))).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: "REFRESH_TOKEN_REUSED" })).toBe(0);
  });

  it("does not end other sessions when a token that was logged out is presented again", async () => {
    const other = await login();
    const loggedOut = refreshCookie(await login());
    await request(app).post("/api/v1/auth/logout").set("Cookie", loggedOut);

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", loggedOut)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(other))).status).toBe(200);
  });

  it("rejects a refresh for a user who has been deactivated", async () => {
    const loggedIn = await login();
    await User.updateOne({ email: "admin@emr.test" }, { isActive: false });
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(loggedIn));
    expect(res.status).toBe(401);
  });

  it("rejects a missing or forged token", async () => {
    expect((await request(app).post("/api/v1/auth/refresh")).status).toBe(401);
    const forged = jwt.sign({}, "some-other-secret-some-other-secret", { subject: "x" });
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", `refreshToken=${forged}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("invalidates the refresh token and clears the cookie", async () => {
    const loggedIn = await login();
    const cookie = refreshCookie(loggedIn);

    const out = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(200);
    expect(refreshCookie(out)).toMatch(/refreshToken=;/);
    expect(await RefreshToken.countDocuments()).toBe(0);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await AuditLog.findOne({ action: "LOGOUT" }))?.role).toBe("SUPER_ADMIN");

  });

  it("succeeds even when nobody is logged in or the cookie is malformed", async () => {
    expect((await request(app).post("/api/v1/auth/logout")).status).toBe(200);
    const crafted = await request(app).post("/api/v1/auth/logout").set("Cookie", 'refreshToken=j:{"a":1}');
    expect(crafted.status).toBe(200);
  });
});

describe("authenticate and authorize", () => {
  const guarded = express()
    .get("/admin-only", authenticate, authorize("SUPER_ADMIN"), (req, res) => {
      res.json({ id: req.user!.id, role: req.user!.role });
    })
    .use(errorHandler);

  it("rejects requests without a valid access token", async () => {
    expect((await request(guarded).get("/admin-only")).status).toBe(401);
    expect((await request(guarded).get("/admin-only").set("Authorization", "Bearer garbage")).status).toBe(401);

    const refreshTokenUsedAsAccess = jwt.sign({ role: "SUPER_ADMIN" }, TEST_REFRESH_SECRET, { subject: "x" });
    expect((await request(guarded).get("/admin-only").set("Authorization", `Bearer ${refreshTokenUsedAsAccess}`)).status).toBe(401);
  });

  it("rejects a token with an unknown role", async () => {
    const res = await request(guarded).get("/admin-only").set("Authorization", `Bearer ${accessToken("GOD")}`);
    expect(res.status).toBe(401);
  });

  it("allows the right role and blocks the wrong one", async () => {
    const admin = await request(guarded).get("/admin-only").set("Authorization", `Bearer ${accessToken("SUPER_ADMIN")}`);
    expect(admin.status).toBe(200);
    expect(admin.body.role).toBe("SUPER_ADMIN");

    const receptionist = await request(guarded)
      .get("/admin-only")
      .set("Authorization", `Bearer ${accessToken("RECEPTIONIST")}`);
    expect(receptionist.status).toBe(403);
    expect(receptionist.body.code).toBe("FORBIDDEN");
  });
});
