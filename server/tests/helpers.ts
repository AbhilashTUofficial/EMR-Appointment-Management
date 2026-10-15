import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { clinicNow } from "../src/utils/time";

// Starts an in-memory MongoDB for the test file and waits for index builds, so unique indexes are in place.
export function useTestDb() {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });
}

// The secrets vitest.config.mts gives the app, for tests that sign their own tokens.
export const TEST_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
export const TEST_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// A date far enough ahead that no slot on it has passed.
export const FUTURE = "2099-03-02";

// Evaluated when called, so a test run that crosses midnight still agrees with the server.
export const today = () => clinicNow(env.CLINIC_TIMEZONE).date;

// Signs an access token directly, so tests don't depend on the login flow.
export const accessToken = (role: string, userId: string | Types.ObjectId = new Types.ObjectId(), expiresIn = 60) =>
  jwt.sign({ role }, TEST_ACCESS_SECRET, { subject: String(userId), expiresIn });

// Requests to the app as a signed-in user, e.g. as("RECEPTIONIST").post("/api/v1/appointments").
export const as = (role: string, id?: string | Types.ObjectId) => {
  const auth = `Bearer ${accessToken(role, id)}`;
  return {
    get: (url: string) => request(app).get(url).set("Authorization", auth),
    post: (url: string) => request(app).post(url).set("Authorization", auth),
    put: (url: string) => request(app).put(url).set("Authorization", auth),
    delete: (url: string) => request(app).delete(url).set("Authorization", auth),
  };
};
