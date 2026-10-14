import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { authenticate } from "../src/middlewares/authenticate";
import { authorize } from "../src/middlewares/authorize";
import { errorHandler } from "../src/middlewares/errorHandler";
import { AuditLog } from "../src/models/auditLog";
import { RefreshToken } from "../src/models/refreshToken";
import { User } from "../src/models/user";

const PASSWORD = "Passw0rd!123";
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

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
    expect(await RefreshToken.countDocuments()).toBe(1);
  });

  it("treats a reused refresh token as theft and ends every session", async () => {
    const first = await login();
    const oldCookie = refreshCookie(first);
    const second = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldCookie);

    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    expect(replay.status).toBe(401);

    const afterReplay = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie(second));
    expect(afterReplay.status).toBe(401);
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
    expect((await AuditLog.findOne({ action: "LOGOUT" }))?.role).toBe("SUPER_ADMIN");

    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(reuse.status).toBe(401);
  });

  it("succeeds even when nobody is logged in", async () => {
    expect((await request(app).post("/api/v1/auth/logout")).status).toBe(200);
  });
});

describe("authenticate and authorize", () => {
  const guarded = express()
    .get("/admin-only", authenticate, authorize("SUPER_ADMIN"), (req, res) => {
      res.json({ id: req.user!.id, role: req.user!.role });
    })
    .use(errorHandler);

  const token = async (email: string) => (await login(email)).body.data.accessToken as string;

  it("rejects requests without a valid access token", async () => {
    expect((await request(guarded).get("/admin-only")).status).toBe(401);
    expect((await request(guarded).get("/admin-only").set("Authorization", "Bearer garbage")).status).toBe(401);

    const refreshTokenUsedAsAccess = jwt.sign({ role: "SUPER_ADMIN" }, "test-refresh-secret-test-refresh-secret", { subject: "x" });
    expect((await request(guarded).get("/admin-only").set("Authorization", `Bearer ${refreshTokenUsedAsAccess}`)).status).toBe(401);
  });

  it("allows the right role and blocks the wrong one", async () => {
    const admin = await request(guarded).get("/admin-only").set("Authorization", `Bearer ${await token("admin@emr.test")}`);
    expect(admin.status).toBe(200);
    expect(admin.body.role).toBe("SUPER_ADMIN");

    const receptionist = await request(guarded)
      .get("/admin-only")
      .set("Authorization", `Bearer ${await token("reception@emr.test")}`);
    expect(receptionist.status).toBe(403);
    expect(receptionist.body.code).toBe("FORBIDDEN");
  });
});
