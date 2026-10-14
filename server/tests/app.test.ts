import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("app", () => {
  it("answers the health check in the standard envelope", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "OK", data: { status: "ok" }, meta: {} });
  });

  it("returns a 404 envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: "NOT_FOUND" });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_JSON");
  });
});
