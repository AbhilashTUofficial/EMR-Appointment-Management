import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { errorHandler } from "../src/middlewares/errorHandler";
import { AuditLog } from "../src/models/auditLog";
import { assertSeedAllowed } from "../src/scripts/seedGuard";
import { logAudit } from "../src/services/auditService";
import { nameWords } from "../src/utils/names";
import { clinicNow } from "../src/utils/time";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("environment settings", () => {
  const load = () => import("../src/config/env.js");

  it("accepts the test configuration and fills in defaults", async () => {
    const { env } = await load();
    expect(env).toMatchObject({ PORT: 4000, TRUST_PROXY: 0, CLINIC_TIMEZONE: "Asia/Kolkata" });
  });

  it("refuses to start with short or identical secrets", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "too-short");
    await expect(load()).rejects.toThrow();

    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("JWT_REFRESH_SECRET", process.env.JWT_ACCESS_SECRET!);
    await expect(load()).rejects.toThrow("JWT secrets must be different");
  });

  it("refuses an unknown timezone and a missing database address", async () => {
    vi.stubEnv("CLINIC_TIMEZONE", "Mars/Olympus");
    await expect(load()).rejects.toThrow("Unknown timezone");

    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("MONGODB_URI", "");
    await expect(load()).rejects.toThrow();
  });

  it("reads COOKIE_SECURE as a true/false setting", async () => {
    vi.stubEnv("COOKIE_SECURE", "false");
    expect((await load()).env.COOKIE_SECURE).toBe(false);
  });
});

describe("seed guard", () => {
  const mongoUri = "mongodb://127.0.0.1:27017/emr";

  it("lets the script run against a local database", () => {
    for (const uri of [mongoUri, "mongodb://localhost/emr", "mongodb://mongo:27017/emr", "mongodb://user:pw@localhost:27017/emr"]) {
      expect(() => assertSeedAllowed({ nodeEnv: "development", mongoUri: uri })).not.toThrow();
    }
  });

  it("refuses a remote database or production unless ALLOW_SEED=1", () => {
    const atlas = "mongodb+srv://user:pw@cluster0.abc.mongodb.net/emr";
    expect(() => assertSeedAllowed({ mongoUri: atlas })).toThrow("ALLOW_SEED=1");
    expect(() => assertSeedAllowed({ nodeEnv: "production", mongoUri })).toThrow("ALLOW_SEED=1");
    expect(() => assertSeedAllowed({ mongoUri: "mongodb://localhost.evil.example/emr" })).toThrow();
    expect(() => assertSeedAllowed({ mongoUri: atlas, allowSeed: "1" })).not.toThrow();
  });
});

describe("error handling", () => {
  const failing = express()
    .get("/boom", () => {
      throw new Error("secret database password is hunter2");
    })
    .use(errorHandler);

  it("answers an unexpected error with a generic 500 and keeps the details to itself", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(failing).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(log).toHaveBeenCalled();
  });

  it("answers malformed and oversized request bodies with 4xx instead of 500", async () => {
    const malformed = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{not json");
    expect(malformed.status).toBe(400);

    const huge = await request(app).post("/api/v1/auth/login").send({ email: "a@b.co", password: "x".repeat(200_000) });
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe("BAD_REQUEST");
  });
});

describe("logAudit", () => {
  it("never fails the request that triggered it", async () => {
    vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("database is down") as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(logAudit({ action: "LOGIN" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("helpers", () => {
  it("splits names into lowercase words on spaces and punctuation", () => {
    expect(nameWords("Anne-Marie O'Brien")).toEqual(["anne", "marie", "o", "brien"]);
    expect(nameWords("  Rohan   DAS ")).toEqual(["rohan", "das"]);
    expect(nameWords("José Núñez")).toEqual(["josé", "núñez"]);
    expect(nameWords("---")).toEqual([]);
  });

  it("reads the date and time on the clinic's clock, not the server's", () => {
    const instant = new Date("2026-03-01T19:00:00Z"); // already the next morning in India
    expect(clinicNow("Asia/Kolkata", instant)).toEqual({ date: "2026-03-02", time: "00:30" });
    expect(clinicNow("UTC", instant)).toEqual({ date: "2026-03-01", time: "19:00" });
  });
});
