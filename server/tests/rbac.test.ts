import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { accessToken, useTestDb } from "./helpers";

useTestDb();

type Role = "SUPER_ADMIN" | "RECEPTIONIST" | "DOCTOR";
type Method = "get" | "post" | "put" | "delete";
const ALL: Role[] = ["SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"];
const UNKNOWN_ID = "64b000000000000000000000";

// Every protected endpoint and the roles that may call it. Requests are deliberately empty or point at
// ids that don't exist: an allowed role gets 400 or 404 from the business rules, a refused role gets 403.
const endpoints: { method: Method; path: string; roles: Role[] }[] = [
  { method: "get", path: "/departments", roles: ALL },
  { method: "get", path: "/doctors", roles: ALL },
  { method: "post", path: "/doctors", roles: ["SUPER_ADMIN"] },
  { method: "put", path: `/doctors/${UNKNOWN_ID}/schedule`, roles: ["SUPER_ADMIN"] },
  { method: "post", path: "/receptionists", roles: ["SUPER_ADMIN"] },
  { method: "get", path: "/slots", roles: ALL },
  { method: "get", path: "/patients", roles: ["SUPER_ADMIN", "RECEPTIONIST"] },
  { method: "post", path: "/appointments", roles: ["SUPER_ADMIN", "RECEPTIONIST"] },
  { method: "get", path: "/appointments", roles: ALL },
  { method: "get", path: `/appointments/${UNKNOWN_ID}`, roles: ALL },
  { method: "put", path: `/appointments/${UNKNOWN_ID}`, roles: ALL },
  { method: "delete", path: `/appointments/${UNKNOWN_ID}`, roles: ["SUPER_ADMIN", "RECEPTIONIST"] },
  { method: "post", path: `/appointments/${UNKNOWN_ID}/arrive`, roles: ["SUPER_ADMIN", "RECEPTIONIST"] },
  { method: "post", path: `/appointments/${UNKNOWN_ID}/complete`, roles: ["DOCTOR"] },
  { method: "get", path: "/dashboard/summary", roles: ALL },
];

const call = (method: Method, path: string, token?: string) => {
  const req = request(app)[method](`/api/v1${path}`);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

describe("role-based access", () => {
  const cases = endpoints.flatMap((e) => ALL.map((role) => ({ ...e, role, allowed: e.roles.includes(role) })));

  it.each(cases)("$method $path as $role (allowed: $allowed)", async ({ method, path, role, allowed }) => {
    const { status } = await call(method, path, accessToken(role));
    if (allowed) {
      expect([401, 403]).not.toContain(status);
      expect(status).toBeLessThan(500);
    } else {
      expect(status).toBe(403);
    }
  });

  it.each(endpoints)("$method $path needs a signed-in user", async ({ method, path }) => {
    expect((await call(method, path)).status).toBe(401);
  });

  it("refuses an expired access token", async () => {
    const expired = accessToken("SUPER_ADMIN", UNKNOWN_ID, -10);
    expect((await call("get", "/doctors", expired)).status).toBe(401);
  });

  it("refuses a token signed with the wrong secret, whatever role it claims", async () => {
    const forged = jwt.sign({ role: "SUPER_ADMIN" }, "some-other-secret-some-other-secret", { subject: UNKNOWN_ID });
    expect((await call("post", "/doctors", forged)).status).toBe(401);
  });
});
