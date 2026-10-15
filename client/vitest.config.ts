import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests don't load the Tailwind plugin.
export default defineConfig({ test: { environment: "jsdom" } });
