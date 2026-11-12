import { defineConfig } from "@playwright/test";

/**
 * E2E (TESTING.md): the built Electron app driven by Playwright. `pnpm e2e` builds first.
 * Every test gets its own data folder, so tests can run in parallel.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "e2e-results",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
