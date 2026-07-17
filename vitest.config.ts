import path from "node:path";
import { defineConfig } from "vitest/config";

// Invariant suite for the lib/ layer (17 Jul 2026). The same tests run twice:
// once against the demo seed and once against the clean seed — the store mode
// is decided by LIMS_CLEAN_SEED at module load, so each project sets it in a
// setup file BEFORE any test imports lib/mock-db. Tests create their own
// organisations (tests/helpers.ts), so they are seed-agnostic by design.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "demo-seed",
          include: ["tests/**/*.test.ts"],
          setupFiles: ["tests/setup.demo.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "clean-seed",
          include: ["tests/**/*.test.ts"],
          setupFiles: ["tests/setup.clean.ts"],
        },
      },
    ],
  },
});
