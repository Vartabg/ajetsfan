import { defineConfig, devices } from "@playwright/test";
const port = process.env.PORT ?? "3107";
export default defineConfig({
  testDir: "./tests", retries: process.env.CI ? 1 : 0,
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: { command: `npm run start -- --hostname 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
});
