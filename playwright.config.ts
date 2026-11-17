import { defineConfig } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_WEB_BASE_URL } from "./e2e/constants";

const useSystemChrome = !process.env.CI;
const includeWebKit = Boolean(process.env.CI || process.env.MARCIA_E2E_WEBKIT === "1");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "list",
  outputDir: "test-results",
  use: {
    baseURL: E2E_WEB_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: "**/workspace.spec.ts",
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      testMatch: "**/workspace.spec.ts",
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    ...(includeWebKit ? [{
      name: "mobile-webkit",
      testMatch: "**/workspace.spec.ts",
      use: {
        browserName: "webkit" as const,
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    }] : []),
    {
      name: "public-site-chromium",
      testMatch: "**/site.spec.ts",
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 1440, height: 900 },
        baseURL: "http://127.0.0.1:3000",
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 3000",
      url: "http://127.0.0.1:3000/",
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: "node e2e/start-api.mjs",
      // Wait until Worker has exercised its D1 binding, not just started the
      // HTTP listener. /health intentionally does not touch the database.
      url: `${E2E_API_BASE_URL}/api/auth/get-session`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { CI: "1", WRANGLER_SEND_METRICS: "false" },
    },
    {
      command: "node e2e/static-server.mjs",
      url: E2E_WEB_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      env: { MARCIA_E2E_WEB_DIR: "apps/mobile/dist" },
    },
  ],
});
