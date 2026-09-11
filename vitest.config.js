import { defineConfig } from "vitest/config";

export default defineConfig({
  // Never load VITE_* values from .env.local into unit-test module evaluation.
  envPrefix: "TEST_",
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
