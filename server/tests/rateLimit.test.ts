import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middlewares/errorHandler";
import { createLoginLimiter } from "../src/middlewares/rateLimit";

// A stand-in login route that always rejects, with the real limiter switched on (the app's own is off under test).
const loginApp = () =>
  express()
    .use(express.json())
    .post("/login", ...createLoginLimiter(() => false), (req, res) => {
      res.status(req.body.email === "good@emr.test" ? 200 : 401).json({});
    })
    .use(errorHandler);

const attempt = (app: express.Express, email: string) => request(app).post("/login").send({ email, password: "x" });

describe("login rate limit", () => {
  it("stops guessing at one account after 10 failures, and says how long to wait", async () => {
    const app = loginApp();
    for (let i = 0; i < 10; i++) expect((await attempt(app, "victim@emr.test")).status).toBe(401);

    const blocked = await attempt(app, "victim@emr.test");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.body.message).toMatch(/Try again in \d+ minutes?\./);
  });

  it("counts the email without regard to case, and leaves other accounts on the same address alone", async () => {
    const app = loginApp();
    for (let i = 0; i < 10; i++) await attempt(app, i % 2 ? "Victim@EMR.test" : "victim@emr.test");

    expect((await attempt(app, "victim@emr.test")).status).toBe(429);
    expect((await attempt(app, "colleague@emr.test")).status).toBe(401);
  });

  it("does not count successful sign-ins", async () => {
    const app = loginApp();
    for (let i = 0; i < 15; i++) expect((await attempt(app, "good@emr.test")).status).toBe(200);
  });

  it("stops one address trying many accounts after 50 failures", async () => {
    const app = loginApp();
    for (let i = 0; i < 50; i++) expect((await attempt(app, `user${i}@emr.test`)).status).toBe(401);
    expect((await attempt(app, "user51@emr.test")).status).toBe(429);
  });
});
