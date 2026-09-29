import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 } } }],
  webServer: {
    command: `rm -f data/e2e.sqlite* && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_OPTIONS: "--import ./tests/e2e/stub-fetch.mjs",
      DATABASE_PATH: "./data/e2e.sqlite",
      ALLOW_MOCK_MODE: "true",
      APP_ORIGIN: `http://localhost:${PORT}`,
      TYPESAFE_API_KEY: "e2e-fake-key-not-real-0000000000",
      JEV_TIMEOUT_MS: "3000",
      RATE_LIMIT_TURNS_PER_MINUTE: "1000",
      RATE_LIMIT_GAMES_PER_HOUR: "1000",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
