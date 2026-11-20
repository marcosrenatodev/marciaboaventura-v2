import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sessionId = process.argv.slice(2).find((argument) => argument !== "--");
if (!sessionId || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(sessionId)) {
  console.error("Uso: pnpm usability:session -- <id-da-sessao>");
  console.error("Exemplo: pnpm usability:session -- ux-marcia-01");
  process.exit(2);
}

function portFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} precisa ser uma porta TCP numérica.`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`${name} precisa estar entre 1024 e 65535.`);
  return port;
}

const apiPort = portFromEnv("MARCIA_USABILITY_API_PORT", 8788);
const webPort = portFromEnv("MARCIA_USABILITY_WEB_PORT", 8082);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const sessionDir = join(repoRoot, ".local", "usability-sessions", sessionId);
const stateDir = join(sessionDir, "state");
const webDir = join(sessionDir, "web");
const workerConfigPath = join(sessionDir, "wrangler.jsonc");
const workerVarsPath = join(sessionDir, ".dev.vars");
const setupTokenPath = join(sessionDir, ".setup-token");

async function assertPortFree(port) {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolveListen));
  }).catch(() => {
    throw new Error(`Não foi possível reservar a porta local ${port}. Ela pode estar ocupada ou o ambiente pode bloquear loopback.`);
  });
}

function makeSessionFiles() {
  const baseDir = dirname(sessionDir);
  mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  chmodSync(baseDir, 0o700);
  if (existsSync(sessionDir)) {
    if (![workerConfigPath, workerVarsPath, setupTokenPath].every(existsSync)) {
      throw new Error(`A sessão ${sessionId} existe, mas está incompleta. Ela foi preservada; escolha outro ID e revise a pasta manualmente.`);
    }
    const savedVars = readFileSync(workerVarsPath, "utf8");
    const savedValue = (key) => savedVars.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];
    if (savedValue("AUTH_BASE_URL") !== apiUrl || savedValue("WEB_ORIGIN") !== webUrl) {
      throw new Error(`A sessão ${sessionId} já está vinculada a outras portas. Reuse as portas gravadas ou crie outro ID de sessão.`);
    }
    chmodSync(sessionDir, 0o700);
    for (const path of [workerConfigPath, workerVarsPath, setupTokenPath]) chmodSync(path, 0o600);
    return;
  }

  mkdirSync(sessionDir, { mode: 0o700 });
  const setupToken = randomBytes(32).toString("base64url");
  const workerConfig = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: `marcia-usability-${sessionId}`,
    main: "../../../apps/api/src/index.ts",
    compatibility_date: "2026-11-16",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    routes: [],
    send_metrics: false,
    logpush: false,
    observability: { enabled: false },
    d1_databases: [{
      binding: "DB",
      database_name: `marcia-usability-${sessionId}`,
      database_id: "LOCAL_ONLY_NOT_A_DEPLOYABLE_DATABASE_ID",
      migrations_dir: "../../../apps/api/migrations",
      remote: false,
    }],
    r2_buckets: [{ binding: "DOCUMENTS", bucket_name: `marcia-usability-${sessionId}`, remote: false }],
  };
  const workerVars = [
    `AUTH_BASE_URL=${apiUrl}`,
    `AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
    `WEB_ORIGIN=${webUrl}`,
    `SETUP_OWNER_TOKEN=${setupToken}`,
    `INTEGRATION_CREDENTIALS_KEY=${randomBytes(32).toString("base64")}`,
    `DOCUMENTS_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
    "INTEGRATION_CREDENTIALS_ENABLED=false",
    "INTEGRATION_OAUTH_ENABLED=false",
    "DJEN_ENABLED=false",
    "DJEN_ENVIRONMENT=homologation",
    "DJEN_TEST_FIXTURES=false",
    "DJEN_SCHEMA_VERIFIED=false",
    "",
  ].join("\n");

  writeFileSync(workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  writeFileSync(workerVarsPath, workerVars, { mode: 0o600, flag: "wx" });
  writeFileSync(setupTokenPath, `${setupToken}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(sessionDir, 0o700);
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitFor(url, child, label, childErrors) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (childErrors.has(child)) throw childErrors.get(child);
    if (child.exitCode !== null) throw new Error(`${label} encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      // The local process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`${label} não respondeu em 60 segundos.`);
}

await assertPortFree(apiPort);
await assertPortFree(webPort);
makeSessionFiles();
mkdirSync(stateDir, { recursive: true, mode: 0o700 });

const workerEnv = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
run("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--config", workerConfigPath, "--local", "--persist-to", stateDir], resolve(repoRoot, "apps/api"), workerEnv);
run("pnpm", ["exec", "expo", "export", "--platform", "web", "--output-dir", webDir], resolve(repoRoot, "apps/mobile"), {
  ...process.env,
  CI: "1",
  EXPO_PUBLIC_API_URL: apiUrl,
});

const worker = spawn("pnpm", [
  "exec", "wrangler", "dev", "--config", workerConfigPath, "--local", "--ip", "127.0.0.1",
  "--port", String(apiPort), "--persist-to", stateDir,
], { cwd: resolve(repoRoot, "apps/api"), env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: "inherit" });
const web = spawn(process.execPath, ["e2e/static-server.mjs"], {
  cwd: repoRoot,
  env: { ...process.env, MARCIA_E2E_WEB_DIR: webDir, MARCIA_E2E_WEB_PORT: String(webPort) },
  stdio: "inherit",
});
const children = [worker, web];
let shuttingDown = false;
const childErrors = new Map();
const shutdown = (signal = "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
};
for (const child of children) child.once("error", (error) => {
  childErrors.set(child, error);
  console.error("Não foi possível iniciar um serviço local:", error.message);
  process.exitCode = 1;
  shutdown("SIGTERM");
});
for (const child of children) child.once("exit", (code) => {
  if (shuttingDown) return;
  process.exitCode = code ?? 1;
  shutdown("SIGTERM");
});
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

try {
  await Promise.all([
    waitFor(`${apiUrl}/health`, worker, "A API local", childErrors),
    waitFor(webUrl, web, "O app Web", childErrors),
  ]);
  console.log(`\nSessão isolada pronta: ${sessionId}`);
  console.log(`App: ${webUrl}`);
  console.log(`API: ${apiUrl} (somente loopback)`);
  console.log(`Código de configuração local (não exibido no log): .local/usability-sessions/${sessionId}/.setup-token`);
  console.log(`Para lê-lo no seu terminal: cat .local/usability-sessions/${sessionId}/.setup-token`);
  console.log("Use apenas dados fictícios. Ctrl+C encerra os servidores e preserva esta sessão.");
} catch (error) {
  shutdown("SIGTERM");
  throw error;
}

await new Promise((resolveDone) => {
  let remaining = children.length;
  for (const child of children) child.once("exit", () => {
    remaining -= 1;
    if (remaining === 0) resolveDone();
  });
});
