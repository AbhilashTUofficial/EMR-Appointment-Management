import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // env.ts requires these; tests that need a real database start their own in-memory one.
      MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
      JWT_ACCESS_SECRET: "test-access-secret-test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret",
    },
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads a mongod binary
  },
});
