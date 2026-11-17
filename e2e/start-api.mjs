import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const apiBaseUrl = "http://127.0.0.1:8787";
const webOrigin = "http://127.0.0.1:8081";
const d1Dir = resolve(process.env.MARCIA_E2E_D1_DIR ?? join(tmpdir(), "marcia-e2e-d1"));
const authSecret = process.env.MARCIA_E2E_AUTH_SECRET ?? "marcia-e2e-auth-only-no-production-use-20261117";
const setupToken = process.env.MARCIA_E2E_SETUP_TOKEN ?? "marcia-local-e2e-setup-token-only-no-client-data-v1";
const projectDir = resolve("apps/api");
const environment = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  AUTH_BASE_URL: apiBaseUrl,
  AUTH_SECRET: authSecret,
  SETUP_OWNER_TOKEN: setupToken,
  WEB_ORIGIN: webOrigin,
};

// Playwright starts webServer before globalSetup. Prepare D1 in this process
// before launching Wrangler so the worker never sees a half-initialized DB.
rmSync(d1Dir, { recursive: true, force: true });
mkdirSync(d1Dir, { recursive: true });
const migration = spawnSync("pnpm", [
  "exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", d1Dir,
], { cwd: projectDir, env: environment, stdio: "inherit" });
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const server = spawn("pnpm", [
  "exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", "8787",
  "--persist-to", d1Dir,
  "--var", `AUTH_BASE_URL:${apiBaseUrl}`,
  "--var", `AUTH_SECRET:${authSecret}`,
  "--var", `WEB_ORIGIN:${webOrigin}`,
  "--var", `SETUP_OWNER_TOKEN:${setupToken}`,
], { cwd: projectDir, env: environment, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
