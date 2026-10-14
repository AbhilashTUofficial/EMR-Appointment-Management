import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // env.ts requires a database URI; tests that need a real database start their own in-memory one.
    env: { MONGODB_URI: "mongodb://127.0.0.1:27017/unused" },
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads a mongod binary
  },
});
