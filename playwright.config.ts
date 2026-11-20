import { defineConfig } from "@playwright/test";
import {
  E2E_API_BASE_URL,
  E2E_AUTH_CONTROL_SECRET,
  E2E_MAINTENANCE_API_BASE_URL,
  E2E_MAINTENANCE_D1_DIR,
  E2E_SITE_BASE_URL,
  E2E_WEB_BASE_URL,
} from "./e2e/constants";

const useSystemChrome = !process.env.CI;
const includeWebKit = Boolean(process.env.CI || process.env.MARCIA_E2E_WEBKIT === "1");
const authOnly = process.env.MARCIA_E2E_AUTH_ONLY === "1";
const authScenario = process.env.MARCIA_E2E_AUTH_SCENARIO;
const authTestMatch = authScenario === "session-lifecycle" ? "**/zz-auth-session-lifecycle.spec.ts"
  : authScenario === "password-change" ? "**/zz-auth-password-change.spec.ts"
  : authScenario === "reset" ? "**/zzz-password-reset.spec.ts"
  : authScenario === "email-limit" ? "**/zz-auth-email-limit.spec.ts"
    : authScenario === "ip-limit" ? "**/zz-auth-ip-limit.spec.ts"
      : "**/zz-auth-security.spec.ts";
const workspaceTestMatch = authOnly ? authTestMatch : "**/workspace.spec.ts";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "list",
  outputDir: process.env.MARCIA_E2E_AUTH_OUTPUT_DIR ?? "test-results",
  use: {
    baseURL: E2E_WEB_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: workspaceTestMatch,
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 1440, height: 900 },
        timezoneId: "America/Sao_Paulo",
      },
    },
    {
      name: "mobile-chromium",
      testMatch: workspaceTestMatch,
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        timezoneId: "America/Sao_Paulo",
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
        timezoneId: "America/Sao_Paulo",
      },
    }] : []),
    {
      name: "public-site-chromium",
      testMatch: "**/site.spec.ts",
      use: {
        browserName: "chromium",
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
        viewport: { width: 1440, height: 900 },
        baseURL: E2E_SITE_BASE_URL,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${new URL(E2E_SITE_BASE_URL).port} --strictPort`,
      url: E2E_SITE_BASE_URL,
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
      env: {
        CI: "1",
        WRANGLER_SEND_METRICS: "false",
        MARCIA_E2E_API_BASE_URL: E2E_API_BASE_URL,
        MARCIA_E2E_WEB_BASE_URL: E2E_WEB_BASE_URL,
        MARCIA_E2E_OAUTH_BASE_URL: process.env.MARCIA_E2E_OAUTH_BASE_URL ?? "http://127.0.0.1:8789",
        MARCIA_E2E_DJEN_FIXTURES: "1",
        MARCIA_E2E_TENANT_ISOLATION: "1",
        MARCIA_E2E_OAUTH_FIXTURES: "1",
        MARCIA_E2E_AUTH_FIXTURES: authScenario === "reset" ? "1" : "0",
        MARCIA_E2E_AUTH_CONTROL_SECRET: authScenario === "reset" ? E2E_AUTH_CONTROL_SECRET : "",
      },
    },
    {
      command: "node e2e/start-api.mjs",
      url: `${E2E_MAINTENANCE_API_BASE_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        CI: "1",
        WRANGLER_SEND_METRICS: "false",
        MARCIA_E2E_API_BASE_URL: E2E_MAINTENANCE_API_BASE_URL,
        MARCIA_E2E_WEB_BASE_URL: E2E_WEB_BASE_URL,
        MARCIA_E2E_D1_DIR: E2E_MAINTENANCE_D1_DIR,
        MARCIA_E2E_SERVICE_MODE: "maintenance",
        MARCIA_E2E_SKIP_MIGRATIONS: "1",
        MARCIA_E2E_TENANT_ISOLATION: "0",
        MARCIA_E2E_DJEN_FIXTURES: "0",
        MARCIA_E2E_OAUTH_FIXTURES: "0",
        MARCIA_E2E_AUTH_FIXTURES: "0",
      },
    },
    {
      command: "node e2e/static-server.mjs",
      url: E2E_WEB_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      env: {
        MARCIA_E2E_WEB_DIR: process.env.MARCIA_E2E_WEB_DIR ?? ".local/e2e-web-build",
        MARCIA_E2E_WEB_PORT: new URL(E2E_WEB_BASE_URL).port,
      },
    },
  ],
});
