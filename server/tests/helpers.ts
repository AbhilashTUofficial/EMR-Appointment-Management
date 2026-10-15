import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";

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

// Signs an access token directly, so tests don't depend on the login flow.
export const accessToken = (role: string, userId: string | Types.ObjectId = new Types.ObjectId(), expiresIn = 60) =>
  jwt.sign({ role }, "test-access-secret-test-access-secret", { subject: String(userId), expiresIn });
