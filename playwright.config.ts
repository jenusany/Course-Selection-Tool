import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Assumes `pnpm dev` (or an already-running dev server) is up — see e2e/README.md.
  // Not using Playwright's webServer here because the app needs a seeded Postgres
  // (docker compose / Postgres.app) that Playwright itself can't provision.
});
