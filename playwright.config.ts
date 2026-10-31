import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the review desk, against the production build in offline
 * sample mode (MOCK_AI=1): no API key, no cost. Run `npm run build` first;
 * `npm run e2e` then starts the app on port 3300 with its own data folder.
 */
const PORT = 3300;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { MOCK_AI: "1", DATA_DIR: ".data-e2e", APP_PASSWORD: "", RUNS_PER_HOUR: "0" },
  },
});
