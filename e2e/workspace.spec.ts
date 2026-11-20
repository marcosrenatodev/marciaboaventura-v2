import { expect, test, type APIRequestContext, type Browser, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  E2E_API_BASE_URL,
  E2E_AUTH_SECRET,
  E2E_D1_DIR,
  E2E_MAINTENANCE_API_BASE_URL,
  E2E_SETUP_TOKEN,
  E2E_USER,
  E2E_WEB_BASE_URL,
} from "./constants";
import isolationUser from "./isolation-user.json" with { type: "json" };

let ownerCreatedDuringRun = false;
let setupLoginLifecycleVerified = false;
const WORKSPACE_SETUP_PASSWORD = "Senha-E2E12!";

async function signIn(page: Page, email = E2E_USER.email, password = WORKSPACE_SETUP_PASSWORD) {
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await fillSecretField(page, "Senha", password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function fillSecretField(page: Page, label: string, value: string, toggleSubject = label.toLocaleLowerCase("pt-BR")) {
  const field = page.getByLabel(label, { exact: true });
  const accessibleSubject = toggleSubject.toLocaleLowerCase("pt-BR");
  await expect(field).toHaveJSProperty("type", "password");
  await page.getByRole("button", { name: `Mostrar ${accessibleSubject}`, exact: true }).click();
  await expect(field).toHaveJSProperty("type", "text");
  await page.getByRole("button", { name: `Ocultar ${accessibleSubject}`, exact: true }).click();
  await expect(field).toHaveJSProperty("type", "password");
  await field.fill(value);
}

async function verifySetupApiPasswordBounds(request: APIRequestContext) {
  const before = queryE2eD1("SELECT status, candidate_email, claim_id FROM setup_control WHERE id = 1")[0];
  expect(before?.status).toBe("ready");

  for (const [password, sourceIp] of [["x".repeat(11), "203.0.113.211"], ["x".repeat(129), "203.0.113.212"]]) {
    const email = `invalid-password-${password.length}@example.test`;
    const response = await request.post(`${E2E_API_BASE_URL}/api/setup/owner`, {
      headers: { Origin: E2E_WEB_BASE_URL, "CF-Connecting-IP": sourceIp },
      data: { name: "Cadastro sintético inválido", email, password, setupToken: E2E_SETUP_TOKEN },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_setup_request" });
    expect(Number(queryE2eD1(`SELECT COUNT(*) AS count FROM user WHERE email = '${email}'`)[0]?.count)).toBe(0);
  }

  expect(queryE2eD1("SELECT status, candidate_email, claim_id FROM setup_control WHERE id = 1")[0]).toEqual(before);
}

async function verifySetupFormBounds(page: Page, request: APIRequestContext, testInfo: TestInfo) {
  await verifySetupApiPasswordBounds(request);
  await page.getByRole("button", { name: "Primeira configuração do escritório" }).click();
  await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
  await expectBrandLogoRendered(page);
  await capturePage(page, testInfo, "auth-setup");
  const setupViewport = page.viewportSize();
  if (setupViewport && setupViewport.width > 760) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectBrandLogoRendered(page);
    await capturePage(page, testInfo, "auth-setup-viewport-mobile-390x844");
    await page.setViewportSize(setupViewport);
    await expectBrandLogoRendered(page);
  }

  let setupRequests = 0;
  page.on("request", (requestEvent) => {
    if (new URL(requestEvent.url()).pathname === "/api/setup/owner") setupRequests += 1;
  });

  const submit = page.getByRole("button", { name: "Criar conta responsável" });
  const name = page.getByLabel("Seu nome", { exact: true });
  const email = page.getByLabel("E-mail", { exact: true });
  await expect(page.getByText("0/120 caracteres · campo obrigatório")).toBeVisible();
  await expect(page.getByText("Informe um e-mail no formato nome@exemplo.com.")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS("opacity", "1");
  await expect(submit).toHaveCSS("background-color", "rgb(101, 95, 93)");
  await expect(page.getByText("Criar conta responsável", { exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");

  await name.fill("N".repeat(121));
  await expect(page.getByText("121/120 caracteres · limite excedido")).toBeVisible();
  await expect(submit).toBeDisabled();
  await name.fill("N".repeat(120));
  await expect(page.getByText("120/120 caracteres · nome preenchido")).toBeVisible();
  await name.fill(E2E_USER.name);
  await email.fill("email-invalido");
  await expect(page.getByText("Informe um e-mail no formato nome@exemplo.com.")).toBeVisible();
  await expect(submit).toBeDisabled();
  await email.fill(E2E_USER.email);

  await fillSecretField(page, "Senha", "x".repeat(11));
  await expect(page.getByText("11/12 caracteres · mínimo necessário")).toBeVisible();
  await expect(submit).toBeDisabled();
  await fillSecretField(page, "Senha", "x".repeat(129));
  await expect(page.getByText("129/128 caracteres · limite excedido")).toBeVisible();
  await expect(submit).toBeDisabled();
  await fillSecretField(page, "Senha", "x".repeat(128));
  await expect(page.getByText("128 caracteres · tamanho adequado")).toBeVisible();
  await expect(submit).toBeDisabled();
  await fillSecretField(page, "Senha", WORKSPACE_SETUP_PASSWORD);
  await expect(page.getByText("12 caracteres · tamanho adequado")).toBeVisible();

  await fillSecretField(page, "Código de configuração", "t".repeat(31));
  await expect(page.getByText("31/32 caracteres · mínimo necessário")).toBeVisible();
  await expect(submit).toBeDisabled();
  await fillSecretField(page, "Código de configuração", "t".repeat(513));
  await expect(page.getByText("513/512 caracteres · limite excedido")).toBeVisible();
  await expect(submit).toBeDisabled();
  await fillSecretField(page, "Código de configuração", "t".repeat(512));
  await expect(page.getByText("512 caracteres · tamanho adequado")).toBeVisible();
  await expect(submit).toBeEnabled();
  await fillSecretField(page, "Código de configuração", "t".repeat(32));
  await expect(page.getByText("32 caracteres · tamanho adequado")).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("background-color", "rgb(217, 151, 38)");
  await expect(submit).toHaveCSS("border-color", "rgb(102, 71, 26)");
  await expect(page.getByText("Criar conta responsável", { exact: true })).toHaveCSS("color", "rgb(40, 37, 38)");
  await capturePage(page, testInfo, "auth-setup-ready");
  if (setupViewport && setupViewport.width > 760) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectBrandLogoRendered(page);
    await expect(submit).toHaveCSS("background-color", "rgb(217, 151, 38)");
    await capturePage(page, testInfo, "auth-setup-ready-viewport-mobile-390x844");
    await page.setViewportSize(setupViewport);
    await expectBrandLogoRendered(page);
  }
  await fillSecretField(page, "Código de configuração", E2E_SETUP_TOKEN);

  expect(setupRequests).toBe(0);
  await expect(submit).toBeEnabled();
}

async function verifyOwnerCanLogInAfterSetup(browser: Browser) {
  if (setupLoginLifecycleVerified) return;
  const context = await browser.newContext({ baseURL: E2E_WEB_BASE_URL });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
    await page.getByRole("button", { name: "Entrar com e-mail" }).click();
    await page.getByLabel("E-mail", { exact: true }).fill(E2E_USER.email);
    await fillSecretField(page, "Senha", "Senha incorreta de E2E!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Não foi possível entrar. Confira o e-mail e a senha e tente novamente.")).toBeVisible();
    expect((await context.request.get(`${E2E_API_BASE_URL}/api/session`)).status()).toBe(401);

    await fillSecretField(page, "Senha", WORKSPACE_SETUP_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByTestId("workspace-session-bar")).toBeVisible({ timeout: 15_000 });
    const session = await context.request.get(`${E2E_API_BASE_URL}/api/session`);
    expect(session.status()).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email: E2E_USER.email }, tenant: { role: "owner" } });
    setupLoginLifecycleVerified = true;
  } finally {
    await context.close();
  }
}

function expectSearchTermNotInUrl(page: Page, query: string) {
  const url = new URL(page.url());
  expect(url.searchParams.has("q")).toBe(false);
  expect(decodeURIComponent(url.href).replaceAll("+", " ")).not.toContain(query);
}

function setupRateLimitBucketKey(sourceIp: string) {
  return createHmac("sha256", E2E_AUTH_SECRET)
    .update(JSON.stringify(["marcia-api-rate-limit-v1", "setup-owner", sourceIp]))
    .digest("hex");
}

function setSetupRateLimitBucket(sourceIp: string, count: number, windowSeconds: number) {
  const bucketKey = setupRateLimitBucketKey(sourceIp);
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const sql = `INSERT INTO api_rate_limits (bucket_key, window_start, request_count)
    VALUES ('${bucketKey}', ${windowStart}, ${count})
    ON CONFLICT (bucket_key) DO UPDATE SET window_start = excluded.window_start, request_count = excluded.request_count;`;
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR, "--command", sql], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function clearSetupRateLimitBucket(sourceIp: string) {
  const bucketKey = setupRateLimitBucketKey(sourceIp);
  execFileSync("pnpm", [
    "exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR,
    "--command", `DELETE FROM api_rate_limits WHERE bucket_key = '${bucketKey}';`,
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function queryE2eD1(sql: string): Array<Record<string, unknown>> {
  const output = execFileSync("pnpm", [
    "exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR,
    "--json", "--command", sql,
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }> | { results?: Array<Record<string, unknown>> };
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((result) => result.results ?? []);
}

function readE2eR2Object(bucketName: string, objectKey: string): Buffer {
  return execFileSync("pnpm", [
    "exec", "wrangler", "r2", "object", "get", `${bucketName}/${objectKey}`,
    "--local", "--persist-to", E2E_D1_DIR, "--pipe",
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    maxBuffer: 12 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function deleteE2eR2Object(bucketName: string, objectKey: string) {
  execFileSync("pnpm", [
    "exec", "wrangler", "r2", "object", "delete", `${bucketName}/${objectKey}`,
    "--local", "--persist-to", E2E_D1_DIR, "--force",
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function replaceE2eR2Object(bucketName: string, objectKey: string, bytes: Uint8Array) {
  const fixturePath = join(tmpdir(), `marcia-e2e-corrupt-${randomUUID()}.bin`);
  await writeFile(fixturePath, bytes, { mode: 0o600, flag: "wx" });
  try {
    execFileSync("pnpm", [
      "exec", "wrangler", "r2", "object", "put", `${bucketName}/${objectKey}`,
      "--local", "--persist-to", E2E_D1_DIR, "--file", fixturePath, "--content-type", "application/octet-stream", "--force",
    ], {
      cwd: resolve(process.cwd(), "apps/api"),
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    await rm(fixturePath, { force: true });
  }
}

async function verifySetupRateLimit(request: APIRequestContext) {
  const sourceIp = "198.51.100.42";
  setSetupRateLimitBucket(sourceIp, 5, 15 * 60);
  try {
    const response = await request.post(`${E2E_API_BASE_URL}/api/setup/owner`, {
      headers: { Origin: E2E_WEB_BASE_URL, "CF-Connecting-IP": sourceIp },
      data: { name: "Setup bloqueado de exemplo", email: "limite-setup@example.test", password: E2E_USER.password, setupToken: E2E_SETUP_TOKEN },
    });
    expect(response.status()).toBe(429);
    expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  } finally {
    clearSetupRateLimitBucket(sourceIp);
  }
}

async function signInOrSetUp(page: Page, request: APIRequestContext, browser: Browser, testInfo: TestInfo) {
  page.on("console", (message) => {
    if (message.type() === "error") console.warn(`[browser] ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown";
    if (reason !== "net::ERR_ABORTED") console.warn(`[browser request failed] ${request.method()} ${new URL(request.url()).pathname} ${reason}`);
  });
  await page.goto("/");
  const welcome = page.getByRole("heading", { name: "Bem-vinda" });
  await expect(welcome).toBeVisible();
  await expectBrandLogoRendered(page);
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expectBrandLogoRendered(page);
  await capturePage(page, testInfo, "auth-login");
  await page.goto("/");
  await expect(welcome).toBeVisible();

  const setupStatus = queryE2eD1("SELECT status FROM setup_control WHERE id = 1")[0]?.status;
  if (ownerCreatedDuringRun || setupStatus === "complete") {
    await signIn(page);
    ownerCreatedDuringRun = true;
  } else {
    expect(setupStatus).toBe("ready");
    await verifySetupFormBounds(page, request, testInfo);
    await page.getByLabel("Seu nome").fill(E2E_USER.name);
    await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
    await fillSecretField(page, "Senha", WORKSPACE_SETUP_PASSWORD);
    await fillSecretField(page, "Código de configuração", E2E_SETUP_TOKEN);
    const setupEndpoint = `${E2E_API_BASE_URL}/api/setup/owner`;
    await page.route(setupEndpoint, (route) => route.fulfill({
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": E2E_WEB_BASE_URL,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "Retry-After",
        "Retry-After": "5",
        Vary: "Origin",
      },
      contentType: "application/json",
      body: JSON.stringify({ error: "setup_unavailable_retry_same_email" }),
    }));
    const temporaryFailure = page.waitForResponse((response) => response.url() === setupEndpoint);
    await page.getByRole("button", { name: "Criar conta responsável" }).click();
    expect((await temporaryFailure).status()).toBe(503);
    await expect(page.getByText("Ocorreu uma falha temporária. Seus dados continuam no formulário; tente novamente com este mesmo e-mail.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta responsável" })).toBeEnabled();
    expect(await page.getByLabel("Senha", { exact: true }).evaluate((input, expected) => (input as HTMLInputElement).value === expected, WORKSPACE_SETUP_PASSWORD)).toBe(true);
    expect(await page.getByLabel("Código de configuração", { exact: true }).evaluate((input, expected) => (input as HTMLInputElement).value === expected, E2E_SETUP_TOKEN)).toBe(true);
    expect(queryE2eD1("SELECT status FROM setup_control WHERE id = 1")[0]?.status).toBe("ready");
    expect(Number(queryE2eD1(`SELECT COUNT(*) AS count FROM user WHERE email = '${E2E_USER.email}'`)[0]?.count)).toBe(0);
    await page.unroute(setupEndpoint);

    const setupResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/setup/owner");
    await page.getByRole("button", { name: "Criar conta responsável" }).click();
    const result = await setupResponse;
    if (result.status() === 409) {
      await page.getByRole("link", { name: "Voltar" }).click();
      await signIn(page);
    } else {
      expect(result.status()).toBe(200);
      await verifyOwnerCanLogInAfterSetup(browser);
    }
    ownerCreatedDuringRun = true;
  }

  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await expectBrandLogoRendered(page);
  const sessionBar = page.getByTestId("workspace-session-bar");
  await expect(sessionBar).toBeVisible();
  const sessionBarBox = await sessionBar.boundingBox();
  expect(sessionBarBox).not.toBeNull();
  expect(sessionBarBox!.height).toBeLessThan(90);
  await expect(page.getByRole("heading", { name: "Seu espaço" })).toBeVisible();
  await verifySetupRateLimit(request);
}

async function apiCookieHeader(page: Page) {
  const cookies = await page.context().cookies(`${E2E_API_BASE_URL}`);
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local E2E port.");
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return port;
}

async function startDocumentKeyProbeWorker(persistDir: string, keyMode: "missing" | "wrong") {
  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const documentKey = keyMode === "missing" ? "" : Buffer.alloc(32, 0x99).toString("base64");
  const worker = spawn("pnpm", [
    "exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
    "--persist-to", persistDir,
    "--var", `AUTH_BASE_URL:${baseUrl}`,
    "--var", `AUTH_SECRET:${E2E_AUTH_SECRET}`,
    "--var", `WEB_ORIGIN:${E2E_WEB_BASE_URL}`,
    "--var", `SETUP_OWNER_TOKEN:${E2E_SETUP_TOKEN}`,
    "--var", `INTEGRATION_CREDENTIALS_KEY:${Buffer.alloc(32, 0x42).toString("base64")}`,
    "--var", `DOCUMENTS_ENCRYPTION_KEY:${documentKey}`,
    "--var", "DOCUMENT_BACKUP_ENABLED:true",
    "--var", "INTEGRATION_CREDENTIALS_ENABLED:true",
    "--var", "INTEGRATION_OAUTH_ENABLED:false",
    "--var", "DJEN_ENABLED:false",
    "--var", "DJEN_SCHEMA_VERIFIED:false",
    "--var", "DJEN_ENVIRONMENT:homologation",
    "--var", "DJEN_TEST_FIXTURES:false",
    "--var", "MARCIA_E2E_OAUTH_FIXTURES:0",
    "--var", "MARCIA_E2E_AUTH_FIXTURES:0",
  ], {
    cwd: resolve("apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let output = "";
  const collect = (chunk: Buffer) => { output = `${output}${chunk.toString("utf8")}`.slice(-4_000); };
  worker.stdout?.on("data", collect);
  worker.stderr?.on("data", collect);

  const stop = async () => {
    const processGroup = worker.pid && process.platform !== "win32" ? -worker.pid : null;
    const groupIsAlive = () => {
      if (!processGroup) return worker.exitCode === null && worker.signalCode === null;
      try {
        process.kill(processGroup, 0);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
        throw error;
      }
    };
    const exited = new Promise<void>((resolveExit) => {
      if (worker.exitCode !== null || worker.signalCode !== null) resolveExit();
      else worker.once("exit", () => resolveExit());
    });
    if (groupIsAlive()) {
      try {
        if (processGroup) process.kill(processGroup, "SIGTERM");
        else worker.kill("SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if ((worker.exitCode !== null || worker.signalCode !== null) && !groupIsAlive()) return;
      await delay(50);
    }
    if (groupIsAlive()) {
      try {
        if (processGroup) process.kill(processGroup, "SIGKILL");
        else worker.kill("SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await Promise.race([exited, delay(1_000)]);
    if (worker.exitCode === null && worker.signalCode === null) {
      throw new Error(`Document key probe worker did not terminate: ${output.slice(-1_500)}`);
    }
    if (groupIsAlive()) throw new Error("Document key probe left a local Wrangler process running.");
  };

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      await stop();
      throw new Error(`Document key probe worker exited early: ${output.slice(-1_500)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/get-session`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return { baseUrl, stop };
    } catch {
      // Wrangler is still starting; retry briefly while the child is healthy.
    }
    await delay(200);
  }
  await stop();
  throw new Error(`Document key probe worker did not become ready: ${output.slice(-1_500)}`);
}

async function verifyDocumentDownloadFailsClosed(documentId: string, cookieHeader: string) {
  for (const keyMode of ["missing", "wrong"] as const) {
    const persistDir = mkdtempSync(join(tmpdir(), "marcia-document-key-probe-"));
    try {
      cpSync(E2E_D1_DIR, persistDir, { recursive: true });
      const worker = await startDocumentKeyProbeWorker(persistDir, keyMode);
      try {
        const response = await fetch(`${worker.baseUrl}/api/documents/${documentId}/download`, {
          headers: { Cookie: cookieHeader },
        });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          error: keyMode === "missing" ? "document_vault_not_configured" : "document_object_unavailable",
        });
      } finally {
        await worker.stop();
      }
    } finally {
      rmSync(persistDir, { recursive: true, force: true });
    }
  }
}

function setFinancialAuditFailureTrigger(enabled: boolean) {
  const d1Dir = resolve(process.env.MARCIA_E2E_D1_DIR ?? join(tmpdir(), "marcia-e2e-d1"));
  const sql = enabled
    ? "CREATE TRIGGER e2e_fail_financial_status_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type = 'financial_entry' AND NEW.action = 'status_changed' BEGIN SELECT RAISE(ABORT, 'synthetic_e2e_audit_failure'); END;"
    : "DROP TRIGGER IF EXISTS e2e_fail_financial_status_audit;";
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", d1Dir, "--command", sql], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function seedRateLimitBucket(tenantId: string, userId: string, scope: string, count: number, windowSeconds: number) {
  const bucketKey = createHmac("sha256", E2E_AUTH_SECRET)
    .update(JSON.stringify(["marcia-api-rate-limit-v1", "tenant", tenantId, "user", userId, scope]))
    .digest("hex");
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const sql = `INSERT INTO api_rate_limits (bucket_key, window_start, request_count)
    VALUES ('${bucketKey}', ${windowStart}, ${count})
    ON CONFLICT (bucket_key) DO UPDATE SET window_start = excluded.window_start, request_count = excluded.request_count;`;
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR, "--command", sql], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function clearRateLimitBucket(tenantId: string, userId: string, scope: string) {
  const bucketKey = createHmac("sha256", E2E_AUTH_SECRET)
    .update(JSON.stringify(["marcia-api-rate-limit-v1", "tenant", tenantId, "user", userId, scope]))
    .digest("hex");
  execFileSync("pnpm", [
    "exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR,
    "--command", `DELETE FROM api_rate_limits WHERE bucket_key = '${bucketKey}';`,
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function executeSyntheticD1Sql(sql: string) {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR, "--command", sql], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

function sqlOpaqueId(value: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Expected a synthetic opaque identifier.");
  return `'${value}'`;
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function seedSyntheticCourtCasePagination(tenantId: string, userId: string, count: number, runId: string) {
  if (!Number.isSafeInteger(count) || count < 51 || count > 100) throw new Error("Unexpected synthetic court-case fixture size.");
  if (!/^[a-z0-9-]{1,32}$/.test(runId)) throw new Error("Unexpected synthetic court-case fixture run id.");
  const createdAt = "2024-01-01T00:00:00.000Z";
  const rows = Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    const id = `e2e-court-${runId}-page-${suffix}`;
    const label = `E2E ${runId} paginação de processo ${suffix}`;
    return `(${sqlOpaqueId(tenantId)}, ${sqlOpaqueId(id)}, NULL, 'Tribunal fictício E2E', 'Demonstração', NULL, ${sqlText(label)}, 'active', '${createdAt}', '${createdAt}', NULL, ${sqlOpaqueId(userId)}, ${sqlOpaqueId(userId)})`;
  });
  executeSyntheticD1Sql(`INSERT INTO court_cases (tenant_id, case_id, matter_id, court_name, jurisdiction, case_number, label, status, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id) VALUES ${rows.join(",\n")};`);
}

function setSyntheticUserSessionAge(userId: string, createdAt: string) {
  const user = sqlOpaqueId(userId);
  executeSyntheticD1Sql(`UPDATE session SET createdAt = '${createdAt}' WHERE userId = ${user};`);
}

function setSyntheticTenantMembershipRole(tenantId: string, userId: string, role: "owner" | "member") {
  executeSyntheticD1Sql(`UPDATE tenant_memberships SET role = '${role}' WHERE tenant_id = ${sqlOpaqueId(tenantId)} AND user_id = ${sqlOpaqueId(userId)};`);
}

function seedSyntheticOversizedExportNotes(tenantId: string, caseId: string, userId: string, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 900) throw new Error("Unexpected synthetic export-limit fixture size.");
  executeSyntheticD1Sql(`
    WITH RECURSIVE fixture_note(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM fixture_note WHERE n < ${count}
    )
    INSERT INTO court_case_notes (tenant_id, note_id, case_id, body, created_at, created_by_user_id)
    SELECT ${sqlOpaqueId(tenantId)}, 'synthetic-export-limit-' || n, ${sqlOpaqueId(caseId)},
      hex(zeroblob(4000)), '2026-11-18T00:00:00.000Z', ${sqlOpaqueId(userId)}
    FROM fixture_note;
  `);
}

function clearSyntheticOversizedExportNotes(tenantId: string) {
  executeSyntheticD1Sql(`DELETE FROM court_case_notes WHERE tenant_id = ${sqlOpaqueId(tenantId)} AND note_id LIKE 'synthetic-export-limit-%';`);
}

async function readGuidedTourProgress(page: Page, request: APIRequestContext) {
  const cookieHeader = await apiCookieHeader(page);
  const response = await request.get(`${E2E_API_BASE_URL}/api/onboarding/office-tour-v1`, { headers: { Cookie: cookieHeader } });
  expect(response.status()).toBe(200);
  return await response.json() as { tourId: string; status: string; stepIndex: number; updatedAt: string | null };
}

async function readGuidedTourScreens(page: Page, request: APIRequestContext) {
  const response = await request.get(`${E2E_API_BASE_URL}/api/onboarding/office-screens-v1`, { headers: { Cookie: await apiCookieHeader(page) } });
  expect(response.status()).toBe(200);
  return await response.json() as { tourId: string; seenScreenIds: string[] };
}

async function assertTourSpotlightGeometry(page: Page, anchorId: string, cardTestId = "guided-tour-card") {
  const target = page.getByTestId(`tour-anchor-${anchorId}`);
  const frame = page.getByTestId("guided-tour-spotlight");
  const card = page.getByTestId(cardTestId);
  await expect(target).toBeAttached({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });
  await expect(frame).toBeVisible({ timeout: 15_000 });
  await expect(card).toBeVisible();
  await expect(frame).toHaveCSS("pointer-events", "none");
  await expect(page.getByTestId("guided-tour-mask-top")).toHaveCSS("pointer-events", "none");
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const [targetBox, frameBox, cardBox] = await Promise.all([target.boundingBox(), frame.boundingBox(), card.boundingBox()]);
    if (!targetBox || !frameBox || !cardBox || !viewport) return false;
    const targetInsideFrame = frameBox.x <= targetBox.x + 1 && frameBox.y <= targetBox.y + 1 &&
      frameBox.x + frameBox.width >= targetBox.x + targetBox.width - 1 &&
      frameBox.y + frameBox.height >= targetBox.y + targetBox.height - 1;
    const cardMissesTarget = cardBox.x + cardBox.width <= targetBox.x || cardBox.x >= targetBox.x + targetBox.width ||
      cardBox.y + cardBox.height <= targetBox.y || cardBox.y >= targetBox.y + targetBox.height;
    const bothInsideViewport = targetBox.x >= 0 && targetBox.y >= 0 && targetBox.x + targetBox.width <= viewport.width + 1 && targetBox.y + targetBox.height <= viewport.height + 1 &&
      frameBox.x >= 0 && frameBox.y >= 0 && frameBox.x + frameBox.width <= viewport.width + 1 && frameBox.y + frameBox.height <= viewport.height + 1 &&
      cardBox.x >= 0 && cardBox.y >= 0 && cardBox.x + cardBox.width <= viewport.width + 1 && cardBox.y + cardBox.height <= viewport.height + 1;
    return targetInsideFrame && cardMissesTarget && bothInsideViewport;
  }, { timeout: 15_000 }).toBe(true);
}

async function completeFirstUseTour(page: Page, request: APIRequestContext) {
  const tour = page.getByTestId("guided-tour-card");
  let currentProgress = await readGuidedTourProgress(page, request);
  await expect.poll(async () => {
    if (currentProgress.status === "not_started") currentProgress = await readGuidedTourProgress(page, request);
    return currentProgress.status !== "not_started";
  }, { timeout: 15_000 }).toBe(true);
  if (currentProgress.status === "completed" || currentProgress.status === "skipped") {
    await openTab(page, "Hoje");
    await reopenTourFromHelp(page);
  } else {
    await expect(tour).toBeVisible({ timeout: 15_000 });
  }
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await expect(tour.getByText("ETAPA 1 DE 6", { exact: true })).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await assertTourSpotlightGeometry(page, "today.workspace-search");

  await page.getByRole("button", { name: "Próxima tela" }).click();
  await expect(tour.getByText("ETAPA 2 DE 6", { exact: true })).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Processos" })).toBeVisible();
  await assertTourSpotlightGeometry(page, "cases.new-process");
  const originalViewport = page.viewportSize();
  if (originalViewport) {
    const narrowerViewport = originalViewport.width >= 760 ? { width: 700, height: 900 } : { width: 360, height: 740 };
    await page.setViewportSize(narrowerViewport);
    await assertTourSpotlightGeometry(page, "cases.new-process");
    await page.setViewportSize(originalViewport);
    await assertTourSpotlightGeometry(page, "cases.new-process");
  }
  await page.getByTestId("tour-anchor-cases.new-process").getByRole("button", { name: "Novo processo" }).click();
  await expect(page.getByTestId("court-picker-trigger")).toBeVisible();
  await assertTourSpotlightGeometry(page, "cases.tribunal");
  await page.getByRole("button", { name: "Fechar formulário de processo" }).click();
  await expect(page.getByTestId("court-case-form")).toHaveCount(0);
  await assertTourSpotlightGeometry(page, "cases.new-process");
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(tour.getByText("ETAPA 1 DE 6", { exact: true })).toBeVisible();
  await assertTourSpotlightGeometry(page, "today.workspace-search");
  await page.getByRole("button", { name: "Próxima tela" }).click();
  await expect(tour.getByText("ETAPA 2 DE 6", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Fechar e continuar depois" }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await expect(tour.getByText("ETAPA 2 DE 6", { exact: true })).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Processos" })).toBeVisible();
  await openTab(page, "Financeiro");
  await expect(page.getByRole("tab", { name: "Financeiro" })).toHaveAttribute("aria-selected", "true");
  await expect(tour).toHaveCount(0);
  expect(await readGuidedTourProgress(page, request)).toMatchObject({ tourId: "office_basics_v1", status: "in_progress", stepIndex: 1 });
  await page.getByTestId("guided-tour-help").click();
  await expect(tour).toBeVisible();
  await expect(tour.getByText("ETAPA 2 DE 6", { exact: true })).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Processos" })).toBeVisible();
  await expect(page.getByRole("tablist").getByRole("tab", { name: "Processos", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Pular tour" }).click();
  await expect(tour).toHaveCount(0);

  const skippedProgress = await readGuidedTourProgress(page, request);
  expect(skippedProgress).toMatchObject({ tourId: "office_basics_v1", status: "skipped", stepIndex: 1 });
  await expect.poll(async () => (await readGuidedTourScreens(page, request)).seenScreenIds).toEqual(expect.arrayContaining(["cases", "today"]));
  const staleTourWrite = await request.put(`${E2E_API_BASE_URL}/api/onboarding/office-tour-v1`, {
    headers: { Cookie: await apiCookieHeader(page) }, data: { status: "in_progress", stepIndex: 0, expectedUpdatedAt: null },
  });
  expect(staleTourWrite.status()).toBe(409);
  const invalidTourCompletion = await request.put(`${E2E_API_BASE_URL}/api/onboarding/office-tour-v1`, {
    headers: { Cookie: await apiCookieHeader(page) }, data: { status: "completed", stepIndex: 1, expectedUpdatedAt: skippedProgress.updatedAt },
  });
  expect(invalidTourCompletion.status()).toBe(400);

  const unauthorizedScreenGuides = await request.get(`${E2E_API_BASE_URL}/api/onboarding/office-screens-v1`);
  expect(unauthorizedScreenGuides.status()).toBe(401);
  const invalidScreenGuide = await request.post(`${E2E_API_BASE_URL}/api/onboarding/office-screens-v1`, {
    headers: { Cookie: await apiCookieHeader(page) }, data: { screenId: "client-files" },
  });
  expect(invalidScreenGuide.status()).toBe(400);

  const screensSeenBeforeContextualVisits = (await readGuidedTourScreens(page, request)).seenScreenIds;
  const screenCard = page.getByTestId("guided-screen-card");
  let calendarSaveFailuresRemaining = 1;
  await page.route("**/api/onboarding/office-screens-v1", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON()?.screenId === "calendar" && calendarSaveFailuresRemaining > 0) {
      calendarSaveFailuresRemaining -= 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_unavailable" }) });
      return;
    }
    await route.continue();
  });
  for (const { tab, title, screenId } of [
    { tab: "Agenda", title: "Agenda", screenId: "calendar" },
    { tab: "Financeiro", title: "Financeiro", screenId: "finance" },
    { tab: "Pesquisa", title: "Pesquisa", screenId: "research" },
    { tab: "Arquivos", title: "Arquivos", screenId: "files" },
  ]) {
    await openTab(page, tab);
    if (screensSeenBeforeContextualVisits.includes(screenId)) {
      await expect(screenCard).toHaveCount(0);
    } else {
      await expect(screenCard).toBeVisible();
      await expect(screenCard.getByRole("heading", { name: title })).toBeVisible();
      await expect(screenCard.getByText("Como usar", { exact: true })).toBeVisible();
      const targetByScreen: Record<string, string> = {
        calendar: "agenda.new-entry", finance: "finance.new-entry", research: "research.question", files: "files.add-document",
      };
      await assertTourSpotlightGeometry(page, targetByScreen[screenId]!, "guided-screen-card");
      await page.getByRole("button", { name: "Fechar guia", exact: true }).click();
      if (screenId === "calendar") {
        await expect(screenCard).toBeVisible();
        await expect(screenCard.getByText("A API está indisponível no momento. Tente novamente.", { exact: true })).toBeVisible();
        await expect(screenCard.getByRole("button", { name: "Tentar salvar orientação" })).toBeVisible();
        await screenCard.getByRole("button", { name: "Tentar salvar orientação" }).click();
        await expect(screenCard).toHaveCount(0);
        expect(calendarSaveFailuresRemaining).toBe(0);
      }
      await expect(screenCard).toHaveCount(0);
      await expect.poll(async () => (await readGuidedTourScreens(page, request)).seenScreenIds).toContain(screenId);
    }
    const marked = await request.post(`${E2E_API_BASE_URL}/api/onboarding/office-screens-v1`, {
      headers: { Cookie: await apiCookieHeader(page) }, data: { screenId },
    });
    expect(marked.status()).toBe(200);
  }
  await page.unroute("**/api/onboarding/office-screens-v1");
  expect((await readGuidedTourScreens(page, request)).seenScreenIds).toEqual(expect.arrayContaining(["today", "cases", "calendar", "finance", "research", "files"]));
  await openTab(page, "Agenda");
  await expect(screenCard).toHaveCount(0);
  await page.getByTestId("guided-tour-help").click();
  await expect(screenCard).toBeVisible();
  await expect(screenCard.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await page.getByRole("button", { name: "Ver tour completo" }).click();

  await openTab(page, "Hoje");
  await reopenTourFromHelp(page);
  await expect(tour).toBeVisible();
  const tourScreens = ["Hoje", "Processos", "Agenda", "Financeiro", "Pesquisa", "Arquivos"];
  for (let index = 0; index < tourScreens.length; index += 1) {
    await expect(tour.getByText(`ETAPA ${index + 1} DE 6`, { exact: true })).toBeVisible();
    await expect(tour.getByRole("heading", { name: tourScreens[index]! })).toBeVisible();
    const targetByScreen = ["today.workspace-search", "cases.new-process", "agenda.new-entry", "finance.new-entry", "research.question", "files.add-document"];
    await assertTourSpotlightGeometry(page, targetByScreen[index]!);
    await page.getByRole("button", { name: index === tourScreens.length - 1 ? "Concluir tour" : "Próxima tela" }).click();
  }
  await expect(tour).toHaveCount(0);
  expect(await readGuidedTourProgress(page, request)).toMatchObject({ tourId: "office_basics_v1", status: "completed", stepIndex: 5 });
  await page.reload();
  await expect(tour).toHaveCount(0);
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tablist").getByRole("tab", { name, exact: true }).click();
}

async function selectAgendaView(page: Page, view: "calendar" | "tasks") {
  const selectedName = view === "calendar" ? "Agenda selecionada" : "Tarefas selecionadas";
  const optionName = view === "calendar" ? "Agenda" : "Tarefas";
  if (await page.getByRole("button", { name: selectedName, exact: true }).count() === 0) {
    await page.getByRole("button", { name: optionName, exact: true }).click();
  }
  await expect(page.getByRole("button", { name: selectedName, exact: true })).toBeVisible();
}

async function reopenTourFromHelp(page: Page) {
  await expect(page.getByRole("tab", { name: "Hoje" })).toHaveAttribute("aria-selected", "true");
  const tour = page.getByTestId("guided-tour-card");
  if (await tour.isVisible().catch(() => false)) return;
  const helpButton = page.getByTestId("guided-tour-help");
  await expect(helpButton).toHaveCount(1);
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  const screenGuide = page.getByTestId("guided-screen-card");
  if (await screenGuide.isVisible().catch(() => false)) {
    await screenGuide.getByRole("button", { name: "Ver tour completo" }).click();
  }
}

async function connectThroughOAuthFixture(page: Page, provider: "google" | "microsoft") {
  const buttonName = provider === "google" ? "Conectar Google Drive" : "Conectar Microsoft OneDrive";
  const authorizationPattern = provider === "google"
    ? /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth(?:\?|$)/
    : /^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize(?:\?|$)/;
  const fixtureAuthorization = async (route: Route) => {
    const authUrl = new URL(route.request().url());
    const redirectUri = authUrl.searchParams.get("redirect_uri");
    const state = authUrl.searchParams.get("state");
    const challenge = authUrl.searchParams.get("code_challenge");
    if (!redirectUri || !state || !challenge) return route.fulfill({ status: 400, body: "fixture request invalid" });
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", `${provider}.${challenge}.${randomUUID()}`);
    callback.searchParams.set("state", state);
    return route.fulfill({ status: 302, headers: { Location: callback.toString() } });
  };
  await page.route(authorizationPattern, fixtureAuthorization);
  try {
    const authorizationRequest = page.waitForRequest((request) => authorizationPattern.test(request.url()));
    await page.getByRole("button", { name: buttonName }).click();
    const authUrl = new URL((await authorizationRequest).url());

    expect(authUrl.searchParams.get("response_type")).toBe("code");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const requestedScopes = (authUrl.searchParams.get("scope") ?? "").split(/\s+/);
    expect(requestedScopes).toContain(provider === "google" ? "https://www.googleapis.com/auth/drive.file" : "Files.Read");
    await expect(page.getByRole("heading", { name: "Conta conectada" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("A autorização foi guardada com segurança. A próxima etapa é escolher quais documentos o escritório quer vincular.")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("code")).toBeNull();
    expect(page.url()).not.toMatch(/access_token|refresh_token|client_secret/i);
    return authUrl;
  } finally {
    await page.unroute(authorizationPattern, fixtureAuthorization);
  }
}

async function returnToIntegrationSettings(page: Page) {
  await page.getByRole("button", { name: "Voltar ao escritório" }).click();
  await page.getByRole("button", { name: "Configurações de integrações" }).click();
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
}

async function activeTabElement(locator: Locator): Promise<Locator> {
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    const belongsToInactiveTab = await candidate.evaluate((element) => Boolean(element.closest("[inert]")));
    if (!belongsToInactiveTab) return candidate;
  }
  throw new Error("Não encontrei o elemento na aba ativa.");
}

async function expectWorkspaceTabAfterReload(page: Page, tab: "Processos" | "Financeiro", route: string, inactiveHeading: string) {
  const path = new URL(page.url()).pathname;
  expect(path, `A URL após reload deveria identificar a aba ${tab}`).toBe(route);
  await expect(page.getByRole("tablist").getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(await activeTabElement(page.getByRole("heading", { name: tab, exact: true }))).toBeVisible();

  const inactiveHeadings = page.getByRole("heading", { name: inactiveHeading, exact: true });
  for (let index = 0; index < await inactiveHeadings.count(); index += 1) {
    const heading = inactiveHeadings.nth(index);
    const belongsToInactiveTab = await heading.evaluate((element) => Boolean(element.closest("[inert]")));
    if (!belongsToInactiveTab) {
      await expect(heading, `Conteúdo de ${inactiveHeading} não pode estar visível quando ${tab} está selecionada`).toBeHidden();
    }
  }
}

async function expectBrandLogoRendered(page: Page) {
  const logo = await activeTabElement(page.getByRole("img", { name: "Logotipo MB Advocacia de Márcia Boaventura" }));
  await expect(logo).toBeVisible();
  await expect.poll(async () => logo.evaluate((element) => element instanceof HTMLImageElement
    ? { complete: element.complete, width: element.naturalWidth, height: element.naturalHeight }
    : null)).toEqual({ complete: true, width: 278, height: 126 });
  const box = await logo.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

async function clickButtonInActiveTab(page: Page, name: string) {
  await (await activeTabElement(page.getByRole("button", { name }))).click();
}

async function signOutFromActiveTab(page: Page) {
  const buttons = page.getByRole("button", { name: "Sair da conta" });
  for (let index = 0; index < await buttons.count(); index += 1) {
    const candidate = buttons.nth(index);
    const belongsToInactiveTab = await candidate.evaluate((element) => Boolean(element.closest("[inert]")));
    if (!belongsToInactiveTab) {
      await candidate.click();
      return;
    }
  }
  throw new Error("Não encontrei o controle de saída da aba ativa.");
}

async function capturePage(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach(name, { body: screenshot, contentType: "image/png" });
}

async function captureAtViewport(page: Page, testInfo: TestInfo, name: string, width: number, height: number, primaryAction?: Locator) {
  await page.setViewportSize({ width, height });
  await expect(page.getByText("Escritório conectado").first()).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll("*").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const element = node;
      const overflowY = getComputedStyle(element).overflowY;
      if (element.scrollHeight > element.clientHeight && overflowY !== "visible" && overflowY !== "hidden") {
        element.scrollTop = 0;
      }
    });
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expectBrandLogoRendered(page);
  if (primaryAction) await expectControlsNotToOverlap(page.getByTestId("guided-tour-help"), primaryAction);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await capturePage(page, testInfo, `${name}-${width}x${height}`);
}

async function expectControlsNotToOverlap(helpAction: Locator, primaryAction: Locator) {
  const [helpBounds, actionBounds] = await Promise.all([helpAction.boundingBox(), primaryAction.boundingBox()]);
  expect(helpBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  if (!helpBounds || !actionBounds) throw new Error("Não foi possível medir os controles do cabeçalho.");
  const separated = helpBounds.x + helpBounds.width <= actionBounds.x || actionBounds.x + actionBounds.width <= helpBounds.x ||
    helpBounds.y + helpBounds.height <= actionBounds.y || actionBounds.y + actionBounds.height <= helpBounds.y;
  expect(separated, "Ajuda não pode cobrir a ação principal do cabeçalho").toBe(true);
}

function taskDateAfterDays(days: number): { input: string; iso: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + days));
  const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return { iso, input: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` };
}

async function selectAgendaDay(page: Page, targetDate: string): Promise<string> {
  const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const visibleMonthTitle = (await page.getByTestId("agenda-month-title").innerText()).toLocaleLowerCase("pt-BR");
  const titleParts = visibleMonthTitle.split(/\s+/);
  const visibleMonthName = titleParts[0];
  const visibleYear = Number(titleParts[titleParts.length - 1]);
  const visibleMonth = monthNames.indexOf(visibleMonthName!) + 1;
  const monthIndex = (year: number, month: number) => year * 12 + month - 1;
  let monthDelta = monthIndex(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)))
    - monthIndex(visibleYear, visibleMonth);
  while (monthDelta > 0) {
    await page.getByRole("button", { name: "Mês seguinte" }).click();
    monthDelta -= 1;
  }
  while (monthDelta < 0) {
    await page.getByRole("button", { name: "Mês anterior" }).click();
    monthDelta += 1;
  }
  const fullDateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" })
    .format(new Date(`${targetDate}T12:00:00.000Z`));
  await page.getByRole("button", { name: fullDateLabel, exact: false }).click();
  return fullDateLabel;
}

test("manutenção pausa a API antes de D1 e informa a pessoa na tela", async ({ page, request }) => {
  const origin = E2E_WEB_BASE_URL;
  const health = await request.get(`${E2E_MAINTENANCE_API_BASE_URL}/health`, { headers: { Origin: origin } });
  expect(health.status()).toBe(200);
  expect(health.headers()["access-control-allow-origin"]).toBe(origin);
  expect(await health.json()).toMatchObject({ status: "ok", maintenanceMode: true, database: "not_checked" });

  const blockedRequests: Array<{ path: string; method: string; data?: object }> = [
    { path: "/api/session", method: "GET" },
    { path: "/api/auth/get-session", method: "GET" },
    { path: "/api/setup/owner", method: "POST", data: {} },
    { path: "/api/onboarding/office-tour-v1", method: "PUT", data: {} },
    { path: "/api/clients/synthetic-client", method: "PATCH", data: {} },
    { path: "/api/clients/synthetic-client", method: "DELETE" },
    { path: "/api/session", method: "OPTIONS" },
    { path: "/api/documents", method: "GET" },
    { path: "/api/documents", method: "POST", data: {} },
    { path: "/__e2e/auth/reset-email", method: "GET" },
  ];
  for (const blocked of blockedRequests) {
    const response = await request.fetch(`${E2E_MAINTENANCE_API_BASE_URL}${blocked.path}`, {
      method: blocked.method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      ...(blocked.data ? { data: blocked.data } : {}),
    });
    expect(response.status(), `${blocked.method} ${blocked.path}`).toBe(503);
    expect(response.headers()["retry-after"]).toBe("60");
    expect(await response.json()).toEqual({ error: "maintenance" });
  }

  await page.route("**/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "ok", service: "marcia-api", maintenanceMode: true, database: "not_checked" }),
  }));
  await page.goto("/");
  await expect(page.getByText(/O sistema do escritório está em manutenção/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com e-mail" })).toBeDisabled();

  await page.unroute("**/health");
  await page.getByRole("button", { name: "Verificar se o sistema voltou" }).click();
  await expect(page.getByRole("button", { name: "Entrar com e-mail" })).toBeEnabled();
});

test("mantém a aba selecionada e o conteúdo correspondente após recarregar Processos e Financeiro", async ({ page, request, browser }, testInfo) => {
  test.setTimeout(180_000);
  await page.clock.setFixedTime(new Date());
  await signInOrSetUp(page, request, browser, testInfo);
  await completeFirstUseTour(page, request);

  await openTab(page, "Processos");
  await expect(page).toHaveURL(/\/processos\/?$/);
  await openTab(page, "Financeiro");
  await expect(page).toHaveURL(/\/financeiro\/?$/);
  await openTab(page, "Processos");
  await expect(page).toHaveURL(/\/processos\/?$/);
  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Carregando dados do escritório…", { exact: true })).toHaveCount(0);
  await expectWorkspaceTabAfterReload(page, "Processos", "/processos", "Financeiro");
  await expect(page.getByTestId("process-collection-courtCases")).toHaveAttribute("aria-selected", "true");
  await capturePage(page, testInfo, "refresh-processos-after-reload");

  await openTab(page, "Financeiro");
  await expect(page).toHaveURL(/\/financeiro\/?$/);
  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Carregando…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Carregando lançamentos…", { exact: true })).toHaveCount(0);
  await expectWorkspaceTabAfterReload(page, "Financeiro", "/financeiro", "Processos");
  await capturePage(page, testInfo, "refresh-financeiro-after-reload");
});

test("configura o escritório, registra processo, tarefa e financeiro e conserva os dados", async ({ page, request, browser, browserName }, testInfo) => {
  test.setTimeout(300_000);
  await page.clock.setFixedTime(new Date());
  await signInOrSetUp(page, request, browser, testInfo);
  await completeFirstUseTour(page, request);
  await openTab(page, "Processos");
  const newProcessButton = page.getByRole("button", { name: "Novo processo" });
  await expect(newProcessButton).toBeVisible();
  await expect(newProcessButton).toHaveCSS("background-color", "rgb(217, 151, 38)");
  await expect(newProcessButton).toHaveCSS("border-color", "rgb(102, 71, 26)");
  await expect(newProcessButton.getByText("Novo processo", { exact: true })).toHaveCSS("color", "rgb(40, 37, 38)");
  await expect(page.getByTestId("court-case-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo processo" }).click();
  await expect(page.getByTestId("court-case-form")).toBeVisible();
  const courtPicker = page.getByTestId("court-picker-trigger");
  await expect(courtPicker).toBeFocused();
  await courtPicker.click();
  await page.getByRole("button", { name: "+ Outro tribunal" }).click();
  await page.getByLabel("Nome do outro tribunal").fill("Tribunal fictício em rascunho");
  await page.getByRole("button", { name: "Usar tribunal" }).click();
  await page.getByRole("button", { name: "Fechar formulário de processo" }).click();
  await expect(page.getByTestId("court-case-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar cadastro do processo" }).click();
  await expect(courtPicker).toHaveText("Tribunal fictício em rascunho");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText("Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo no escritório ainda.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar preenchendo processo" }).click();
  await expect(courtPicker).toHaveText("Tribunal fictício em rascunho");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do processo" }).click();
  await expect(page.getByTestId("court-case-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo processo" })).toBeVisible();
  await openTab(page, "Hoje");
  const todayNewTask = page.getByRole("button", { name: "Nova tarefa", exact: true });
  await expect(todayNewTask).toBeVisible();
  await expect(todayNewTask).toHaveCSS("background-color", "rgb(217, 151, 38)");
  await expect(todayNewTask).toHaveCSS("border-color", "rgb(102, 71, 26)");
  const todayNewTaskBox = await todayNewTask.boundingBox();
  expect(todayNewTaskBox).not.toBeNull();
  expect(todayNewTaskBox!.y).toBeGreaterThanOrEqual(0);
  expect(todayNewTaskBox!.y + todayNewTaskBox!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  const todayWorkspaceSearch = page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" });
  const todayWorkspaceSearchBox = await todayWorkspaceSearch.boundingBox();
  expect(todayWorkspaceSearchBox).not.toBeNull();
  expect(todayWorkspaceSearchBox!.y).toBeGreaterThan(todayNewTaskBox!.y);
  expect(todayWorkspaceSearchBox!.y + todayWorkspaceSearchBox!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  await todayNewTask.click();
  await expect(page.getByRole("textbox", { name: "Título da tarefa" })).toBeFocused();
  await openTab(page, "Hoje");
  await expect(page.getByRole("heading", { name: "Ações rápidas" })).toBeVisible();
  const quickActions = page.getByTestId("today-quick-actions");
  await expect(quickActions.getByRole("button", { name: "Nova tarefa", exact: true })).toHaveCount(0);
  await quickActions.getByRole("button", { name: "Novo processo" }).click();
  await expect(courtPicker).toBeFocused();
  await openTab(page, "Hoje");
  await quickActions.getByRole("button", { name: "Registrar receita" }).click();
  await expect(page.getByRole("textbox", { name: "Descrição do lançamento" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Receita selecionada" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar formulário de lançamento" }).click();
  await expect(page.getByTestId("finance-entry-form")).toHaveCount(0);
  await openTab(page, "Hoje");
  await quickActions.getByRole("button", { name: "Lançar despesa" }).click();
  await expect(page.getByRole("textbox", { name: "Descrição do lançamento" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Despesa selecionada" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar formulário de lançamento" }).click();
  await expect(page.getByTestId("finance-entry-form")).toHaveCount(0);
  await openTab(page, "Hoje");
  const fixture = `E2E ${testInfo.project.name} tentativa ${testInfo.retry + 1}`;
  const clientName = `${fixture} — Cliente fictício`;
  const revisedClientName = `${fixture} — Cliente revisado`;
  const matterTitle = `${fixture} — Pasta de exemplo`;
  const renamedMatterTitle = `${fixture} — Pasta revisada`;
  const taskTitle = `${fixture} — Próximo passo de trabalho`;
  const renamedTaskTitle = `${fixture} — Providência revisada`;
  const taskSchedule = taskDateAfterDays(7);
  const revisedTaskSchedule = taskDateAfterDays(8);
  const appointmentSchedule = taskDateAfterDays(14);
  const expenseTitle = `${fixture} — Despesa fictícia`;
  const revisedExpenseTitle = `${fixture} — Despesa revisada`;
  const expenseCategory = `${fixture} — Categoria operacional`;
  const revisedExpenseCategory = `${fixture} — Categoria revista`;
  const serverUpdatedExpenseTitle = `${fixture} — Despesa corrigida em paralelo`;
  const appointmentTitle = `${fixture} — Reunião fictícia`;
  const revisedAppointmentTitle = `${fixture} — Reunião revisada`;
  const caseLabel = `${fixture} — Caso fictício`;
  const revisedCaseLabel = `${fixture} — Caso revisado`;
  const caseNoteBody = `${fixture} — Contato de exemplo registrado manualmente.`;
  const researchQuery = `${fixture} — responsabilidade civil falha na prestação de serviço`;
  const revisedResearchQuery = `${fixture} — responsabilidade civil em transporte de passageiros`;
  const socialDraftTopic = `${fixture} — Tema de divulgação sintético`;
  const socialDraftContent = `${fixture} — Texto sintético para validar o salvamento. Sem caso, cliente ou orientação jurídica.`;
  const concurrentSocialDraftContent = `${fixture} — Texto editado em outra tela. Sem caso, cliente ou orientação jurídica.`;
  const revisedSocialDraftContent = `${fixture} — Texto sintético revisado. Sem caso, cliente ou orientação jurídica.`;
  const documentDisplayName = `${fixture} — Documento de demonstração`;
  const documentBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
  const googleImportedName = "Peça de demonstração Google.pdf";
  const microsoftImportedName = "Peça de demonstração OneDrive.pdf";

  const unauthorized = await request.get(`${E2E_API_BASE_URL}/api/session`);
  expect(unauthorized.status()).toBe(401);
  expect(unauthorized.headers()).toMatchObject({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  const unauthorizedTour = await request.get(`${E2E_API_BASE_URL}/api/onboarding/office-tour-v1`);
  expect(unauthorizedTour.status()).toBe(401);
  const crossSiteMutation = await request.post(`${E2E_API_BASE_URL}/api/legal-researches`, {
    headers: { "Sec-Fetch-Site": "cross-site" },
    data: { query: `${fixture} teste`, courtId: "tjpr" },
  });
  expect(crossSiteMutation.status()).toBe(403);
  const trustedCrossOrigin = await request.post(`${E2E_API_BASE_URL}/api/legal-researches`, {
    headers: { Origin: `${E2E_WEB_BASE_URL}`, "Sec-Fetch-Site": "cross-site" },
    data: { query: `${fixture} teste`, courtId: "tjpr" },
  });
  expect(trustedCrossOrigin.status()).toBe(401);
  const publicSignup = await request.post(`${E2E_API_BASE_URL}/api/auth/sign-up/email`, {
    data: { name: "Conta bloqueada E2E", email: "cadastro-publico@example.test", password: E2E_USER.password },
  });
  expect([400, 401, 403]).toContain(publicSignup.status());

  const cookies = await page.context().cookies(`${E2E_API_BASE_URL}`);
  let cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  await openTab(page, "Processos");
  await page.getByRole("button", { name: "Configurações de integrações" }).click();
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
  await fillSecretField(page, "Google Picker API key", "fake-picker-key-e2e-only", "chave da API do Google Picker");
  await page.getByLabel("Google OAuth Client ID").fill("google-client-e2e.apps.example.test");
  await fillSecretField(page, "Google OAuth Client Secret", "fake-google-client-secret-e2e-only", "segredo oauth do google");
  await page.getByRole("button", { name: "Salvar configuração Google" }).click();
  await expect(page.getByText("Credenciais salvas cifradas no servidor. Nenhum segredo foi devolvido ao app.")).toBeVisible();
  const integrationResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations`, { headers: { Cookie: cookieHeader } });
  expect(integrationResponse.status()).toBe(200);
  const googleSettings = await integrationResponse.json() as { googleDrive: { configured: boolean; clientId: string | null; pickerApiKeyConfigured: boolean; clientSecretConfigured: boolean; connectionStatus: string } };
  expect(googleSettings.googleDrive).toMatchObject({
    configured: true, clientId: "google-client-e2e.apps.example.test", pickerApiKeyConfigured: true,
    clientSecretConfigured: true, connectionStatus: "not_connected",
  });
  const settingsBody = JSON.stringify(googleSettings);
  expect(settingsBody).not.toContain("fake-picker-key-e2e-only");
  expect(settingsBody).not.toContain("fake-google-client-secret-e2e-only");
  const googleAuthorizationUrl = await connectThroughOAuthFixture(page, "google");
  const googleCallbackUrl = new URL(googleAuthorizationUrl.searchParams.get("redirect_uri")!);
  googleCallbackUrl.searchParams.set("code", "replayed-google-code");
  googleCallbackUrl.searchParams.set("state", googleAuthorizationUrl.searchParams.get("state")!);
  expect((await request.get(googleCallbackUrl.toString(), { maxRedirects: 0 })).status()).toBe(400);
  const connectedGoogleResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations`, { headers: { Cookie: cookieHeader } });
  const connectedGoogle = await connectedGoogleResponse.json() as { googleDrive: { connectionStatus: string; connectedAccountLabel: string | null; grantedScopes: string[] } };
  expect(connectedGoogle.googleDrive).toMatchObject({ connectionStatus: "connected", connectedAccountLabel: "google-e2e@example.test" });
  expect(connectedGoogle.googleDrive.grantedScopes).toContain("https://www.googleapis.com/auth/drive.file");
  const connectedGoogleBody = JSON.stringify(connectedGoogle);
  expect(connectedGoogleBody).not.toContain("synthetic-google-access-token");
  expect(connectedGoogleBody).not.toContain("synthetic-google-refresh-token");
  expect(connectedGoogleBody).not.toContain("fake-google-client-secret-e2e-only");
  const googlePickerResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations/google-drive/picker-session`, {
    headers: { Cookie: cookieHeader, Origin: `${E2E_WEB_BASE_URL}` },
  });
  expect(googlePickerResponse.status()).toBe(200);
  expect(await googlePickerResponse.json()).toMatchObject({
    developerKey: "fake-picker-key-e2e-only",
    accessToken: "synthetic-google-refreshed-access-token",
  });
  await returnToIntegrationSettings(page);
  let failInitialIntegrationSettingsRequest = true;
  await page.route(`${E2E_API_BASE_URL}/api/integrations`, async (route) => {
    if (failInitialIntegrationSettingsRequest) {
      failInitialIntegrationSettingsRequest = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "synthetic_integration_outage" }) });
      return;
    }
    await route.continue();
  });
  await openTab(page, "Arquivos");
  await expect(page.getByTestId("documents-source-form")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Arquivos do escritório" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar documento", exact: true }).click();
  await expect(page.getByTestId("documents-source-form")).toBeVisible();
  await expect(page.getByTestId("documents-integration-issue")).toBeVisible();
  await expect(page.getByText("Google Drive ainda não conectado. Configure em Conta → Integrações.")).toHaveCount(0);
  await page.getByRole("button", { name: "Tentar verificar conexões" }).click();
  await expect(page.getByTestId("documents-integration-issue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Escolher PDF no Google Drive" })).toBeVisible();
  await page.unroute(`${E2E_API_BASE_URL}/api/integrations`);
  await page.evaluate(() => {
    class TestDocsView {
      setIncludeFolders() { return this; }
      setMimeTypes() { return this; }
    }
    class TestPickerBuilder {
      private callback?: (result: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => void;
      addView() { return this; }
      setOAuthToken() { return this; }
      setDeveloperKey() { return this; }
      setOrigin() { return this; }
      setCallback(callback: (result: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => void) {
        this.callback = callback;
        return this;
      }
      build() {
        return { setVisible: (visible: boolean) => {
          if (visible) this.callback?.({
            action: "picked",
            docs: [{ id: "synthetic-google-pdf", name: "Peça de demonstração Google.pdf", mimeType: "application/pdf" }],
          });
        } };
      }
    }
    Object.defineProperty(window, "gapi", {
      configurable: true,
      value: {
        load: (_name: string, options: { callback: () => void }) => options.callback(),
        picker: { DocsView: TestDocsView, PickerBuilder: TestPickerBuilder, Action: { PICKED: "picked", CANCEL: "cancel" }, ViewId: { DOCS: "docs" } },
      },
    });
  });
  const documentsBeforeCanceledPickerResponse = await request.get(`${E2E_API_BASE_URL}/api/documents`, { headers: { Cookie: cookieHeader } });
  const documentsBeforeCanceledPicker = (await documentsBeforeCanceledPickerResponse.json() as { items: Array<{ id: string }> }).items.map((item) => item.id).sort();
  await page.getByRole("button", { name: "Escolher PDF no Google Drive" }).click();
  await expect(page.getByTestId("selected-cloud-document").getByText(googleImportedName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar seleção do arquivo do Drive" }).click();
  await expect(page.getByTestId("selected-cloud-document")).toHaveCount(0);
  const documentsAfterCanceledPicker = await request.get(`${E2E_API_BASE_URL}/api/documents`, { headers: { Cookie: cookieHeader } });
  expect((await documentsAfterCanceledPicker.json() as { items: Array<{ id: string }> }).items.map((item) => item.id).sort()).toEqual(documentsBeforeCanceledPicker);
  await page.getByRole("button", { name: "Escolher PDF no Google Drive" }).click();
  await expect(page.getByTestId("selected-cloud-document").getByText(googleImportedName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Importar PDF para o cofre" }).click();
  await expect(page.getByText(`“${googleImportedName}” foi copiado para o cofre privado do escritório.`)).toBeVisible();
  await expect(await activeTabElement(page.getByRole("heading", { name: googleImportedName, exact: true }))).toBeVisible();
  const googleVaultResponse = await request.get(`${E2E_API_BASE_URL}/api/documents`, { headers: { Cookie: cookieHeader } });
  const googleVault = await googleVaultResponse.json() as { items: Array<{ id: string; fileName: string; byteSize: number }> };
  const importedGooglePdf = googleVault.items.find((item) => item.fileName === googleImportedName);
  expect(importedGooglePdf).toMatchObject({ fileName: googleImportedName, byteSize: documentBytes.byteLength });
  const googlePdfDownload = await request.get(`${E2E_API_BASE_URL}/api/documents/${importedGooglePdf!.id}/download`, { headers: { Cookie: cookieHeader } });
  expect(Buffer.from(await googlePdfDownload.body()).equals(documentBytes)).toBe(true);
  expect((await request.post(`${E2E_API_BASE_URL}/api/integrations/google-drive/import`, {
    headers: { Cookie: cookieHeader }, data: { fileId: "synthetic-google-invalid-pdf" },
  })).status()).toBe(415);
  expect((await request.post(`${E2E_API_BASE_URL}/api/integrations/google-drive/import`, {
    headers: { Cookie: cookieHeader }, data: { fileId: "synthetic-google-large-pdf" },
  })).status()).toBe(413);
  const googleDocImport = await request.post(`${E2E_API_BASE_URL}/api/integrations/google-drive/import`, {
    headers: { Cookie: cookieHeader }, data: { fileId: "synthetic-google-doc" },
  });
  expect(googleDocImport.status()).toBe(201);
  expect((await googleDocImport.json() as { item: { fileName: string } }).item.fileName).toBe("Documento convertido do Google.pdf");
  await openTab(page, "Processos");
  await page.getByRole("button", { name: "Voltar para assuntos e processos" }).click();
  await page.getByRole("button", { name: "Configurações de integrações" }).click();
  await page.getByRole("button", { name: "Desconectar Google Drive" }).click();
  await page.getByRole("button", { name: "Confirmar desconexão Google" }).click();
  await expect(page.getByText("A conta foi desconectada e o token de atualização foi revogado no Google.")).toBeVisible();
  await page.getByRole("button", { name: "Remover todas as credenciais Google" }).click();
  await page.getByRole("button", { name: "Confirmar remoção Google" }).click();
  await expect(page.getByText("Credenciais removidas do cofre. A conta nunca esteve conectada a arquivos.")).toBeVisible();
  const clearedIntegrationResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations`, { headers: { Cookie: cookieHeader } });
  const clearedSettings = await clearedIntegrationResponse.json() as { googleDrive: { configured: boolean } };
  expect(clearedSettings.googleDrive.configured).toBe(false);
  await page.getByLabel("Microsoft Application Client ID").fill("microsoft-client-e2e-app");
  await page.getByLabel("Microsoft Tenant ID").fill("common");
  await fillSecretField(page, "Microsoft Client Secret", "fake-microsoft-client-secret-e2e-only", "segredo do aplicativo microsoft");
  await page.getByRole("button", { name: "Salvar configuração Microsoft" }).click();
  await expect(page.getByText("Credenciais salvas cifradas no servidor. Nenhum segredo foi devolvido ao app.")).toBeVisible();
  const microsoftSettingsResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations`, { headers: { Cookie: cookieHeader } });
  const microsoftSettings = await microsoftSettingsResponse.json() as { microsoftGraph: { configured: boolean; clientId: string | null; tenantId: string | null; clientSecretConfigured: boolean; connectionStatus: string } };
  expect(microsoftSettings.microsoftGraph).toMatchObject({
    configured: true, clientId: "microsoft-client-e2e-app", tenantId: "common", clientSecretConfigured: true, connectionStatus: "not_connected",
  });
  expect(JSON.stringify(microsoftSettings)).not.toContain("fake-microsoft-client-secret-e2e-only");
  await connectThroughOAuthFixture(page, "microsoft");
  const connectedMicrosoftResponse = await request.get(`${E2E_API_BASE_URL}/api/integrations`, { headers: { Cookie: cookieHeader } });
  const connectedMicrosoft = await connectedMicrosoftResponse.json() as { microsoftGraph: { connectionStatus: string; connectedAccountLabel: string | null; grantedScopes: string[] } };
  expect(connectedMicrosoft.microsoftGraph).toMatchObject({ connectionStatus: "connected", connectedAccountLabel: "microsoft-e2e@example.test" });
  expect(connectedMicrosoft.microsoftGraph.grantedScopes).toContain("Files.Read");
  const connectedMicrosoftBody = JSON.stringify(connectedMicrosoft);
  expect(connectedMicrosoftBody).not.toContain("synthetic-microsoft-access-token");
  expect(connectedMicrosoftBody).not.toContain("synthetic-microsoft-refresh-token");
  expect(connectedMicrosoftBody).not.toContain("fake-microsoft-client-secret-e2e-only");
  await returnToIntegrationSettings(page);
  await openTab(page, "Arquivos");
  await page.getByRole("button", { name: "Adicionar documento", exact: true }).click();
  await page.getByRole("button", { name: "Abrir arquivos do OneDrive" }).click();
  await expect(page.getByRole("button", { name: "Abrir pasta: Pasta de demonstração" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Selecionar PDF: Peça de demonstração OneDrive.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Carregar mais arquivos" }).click();
  await expect(page.getByRole("button", { name: "Selecionar PDF: Segundo arquivo Microsoft.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir pasta: Pasta de demonstração" }).click();
  await expect(page.getByRole("button", { name: "Selecionar PDF: Anexo da pasta.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar para Meus arquivos" }).click();
  await page.getByRole("button", { name: "Selecionar PDF: Peça de demonstração OneDrive.pdf" }).click();
  await expect(page.getByTestId("selected-cloud-document").getByText(microsoftImportedName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Importar PDF para o cofre" }).click();
  await expect(page.getByText(`“${microsoftImportedName}” foi copiado para o cofre privado do escritório.`)).toBeVisible();
  await expect(await activeTabElement(page.getByRole("heading", { name: microsoftImportedName, exact: true }))).toBeVisible();
  const microsoftVaultResponse = await request.get(`${E2E_API_BASE_URL}/api/documents`, { headers: { Cookie: cookieHeader } });
  const microsoftVault = await microsoftVaultResponse.json() as { items: Array<{ id: string; fileName: string; byteSize: number }> };
  const importedMicrosoftPdf = microsoftVault.items.find((item) => item.fileName === microsoftImportedName);
  expect(importedMicrosoftPdf).toMatchObject({ fileName: microsoftImportedName, byteSize: documentBytes.byteLength });
  const microsoftPdfDownload = await request.get(`${E2E_API_BASE_URL}/api/documents/${importedMicrosoftPdf!.id}/download`, { headers: { Cookie: cookieHeader } });
  expect(Buffer.from(await microsoftPdfDownload.body()).equals(documentBytes)).toBe(true);
  const unsafeMicrosoftRedirect = await request.post(`${E2E_API_BASE_URL}/api/integrations/microsoft-graph/import`, {
    headers: { Cookie: cookieHeader }, data: { fileId: "synthetic-microsoft-unsafe" },
  });
  expect(unsafeMicrosoftRedirect.status()).toBe(502);
  if (testInfo.project.name === "desktop-chromium") {
    const oversizedProviderPdf = await request.post(`${E2E_API_BASE_URL}/api/integrations/microsoft-graph/import`, {
      headers: { Cookie: cookieHeader }, data: { fileId: "synthetic-microsoft-stream-large" },
    });
    expect(oversizedProviderPdf.status()).toBe(413);
  }
  await openTab(page, "Processos");
  await page.getByRole("button", { name: "Voltar para assuntos e processos" }).click();
  await page.getByRole("button", { name: "Configurações de integrações" }).click();
  await page.getByRole("button", { name: "Desconectar Microsoft" }).click();
  await page.getByRole("button", { name: "Confirmar desconexão Microsoft" }).click();
  await expect(page.getByText("A conta foi desconectada deste app. Para revogar o consentimento Microsoft, revise os aplicativos autorizados na conta ou peça ajuda ao administrador do Microsoft 365.")).toBeVisible();
  await page.getByRole("button", { name: "Remover todas as credenciais Microsoft" }).click();
  await page.getByRole("button", { name: "Confirmar remoção Microsoft" }).click();
  await expect(page.getByText("Credenciais removidas do cofre. A conta nunca esteve conectada a arquivos.")).toBeVisible();
  await page.getByRole("button", { name: "Voltar para assuntos e processos" }).click();
  await page.getByTestId("process-collection-clients").click();
  await expect(page.getByTestId("client-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await expect(page.getByLabel("Nome do cliente")).toBeFocused();
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("Informe o nome do cliente.")).toBeVisible();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByLabel("Nome do cliente").fill(`${clientName} em rascunho`);
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByTestId("client-form")).not.toBeVisible();
  await page.getByTestId("process-collection-clients").click();
  await expect(page.getByLabel("Nome do cliente")).toHaveValue(`${clientName} em rascunho`);
  await page.getByRole("button", { name: "Fechar formulário de cliente" }).click();
  await expect(page.getByTestId("client-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar cadastro do cliente" }).click();
  await expect(page.getByLabel("Nome do cliente")).toHaveValue(`${clientName} em rascunho`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar preenchendo cliente" }).click();
  await expect(page.getByLabel("Nome do cliente")).toHaveValue(`${clientName} em rascunho`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do cliente" }).click();
  await expect(page.getByTestId("client-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page.getByLabel("Nome do cliente").fill(clientName);
  await page.getByLabel("E-mail do cliente, opcional").fill("contato-e2e@example.test");
  await page.getByLabel("Telefone do cliente, opcional").fill("41999990000");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("Cliente cadastrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page.getByLabel("Nome do cliente").fill(`${clientName} rascunho não sobrescrito`);
  await page.getByRole("button", { name: `Editar cliente: ${clientName}` }).click();
  await expect(page.getByText("Salve ou descarte o formulário atual antes de abrir outro cliente.")).toBeVisible();
  await expect(page.getByLabel("Nome do cliente")).toHaveValue(`${clientName} rascunho não sobrescrito`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do cliente" }).click();
  await page.getByRole("button", { name: `Editar cliente: ${clientName}` }).click();
  await page.getByLabel("Nome do cliente").fill(revisedClientName);
  await page.getByLabel("E-mail do cliente, opcional").fill("revisado-e2e@example.test");
  await page.getByRole("button", { name: "Salvar alterações do cliente" }).click();
  await expect(page.getByText("Alterações do cliente salvas.")).toBeVisible();
  await expect(page.getByRole("heading", { name: revisedClientName })).toBeVisible();
  await openTab(page, "Hoje");
  const officeSearch = page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" });
  await expect(officeSearch).toHaveAttribute("autocomplete", "off");
  await officeSearch.focus();
  await expect(officeSearch).toHaveCSS("border-top-color", "rgb(102, 71, 26)");
  await officeSearch.fill(revisedClientName);
  await page.getByRole("button", { name: `Abrir cliente: ${revisedClientName}` }).click();
  expectSearchTermNotInUrl(page, revisedClientName);
  await expect(page.getByLabel("Buscar clientes por nome, e-mail ou telefone")).toHaveValue(revisedClientName);
  await expect(page.getByRole("heading", { name: revisedClientName })).toBeVisible();
  await page.getByRole("button", { name: "Voltar para processos" }).click();
  await page.getByLabel("Buscar processos cadastrados").fill("");
  const clientsResponse = await request.get(`${E2E_API_BASE_URL}/api/clients`, { headers: { Cookie: cookieHeader } });
  expect(clientsResponse.status()).toBe(200);
  const clientList = await clientsResponse.json() as { items: Array<{ id: string; displayName: string; email: string | null; phone: string | null; status: string }> };
  const linkedClient = clientList.items.find((client) => client.displayName === revisedClientName);
  expect(linkedClient).toBeDefined();
  expect(linkedClient?.email).toBe("revisado-e2e@example.test");
  expect(linkedClient?.phone).toBe("41999990000");
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByTestId("matter-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  await expect(page.getByLabel("Nome do assunto")).toBeFocused();
  await page.getByRole("button", { name: "Cadastrar assunto" }).click();
  await expect(page.getByText("Informe um nome para o assunto.")).toBeVisible();
  await expect(page.getByTestId("matter-form")).toBeVisible();
  await page.getByLabel("Nome do assunto").fill(`${matterTitle} em rascunho`);
  await page.getByTestId("process-collection-courtCases").click();
  await expect(page.getByTestId("matter-form")).toHaveCount(0);
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByLabel("Nome do assunto")).toHaveValue(`${matterTitle} em rascunho`);
  await expect(page.getByLabel("Nome do assunto")).toBeFocused();
  await page.getByRole("button", { name: "Fechar formulário de assunto" }).click();
  await expect(page.getByTestId("matter-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar cadastro do assunto" }).click();
  await expect(page.getByLabel("Nome do assunto")).toHaveValue(`${matterTitle} em rascunho`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar preenchendo assunto" }).click();
  await expect(page.getByLabel("Nome do assunto")).toHaveValue(`${matterTitle} em rascunho`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do assunto" }).click();
  await expect(page.getByTestId("matter-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  await page.getByLabel("Nome do assunto").fill(matterTitle);
  await page.getByRole("button", { name: `Selecionar cliente: ${revisedClientName}` }).click();
  await page.getByRole("button", { name: "Cadastrar assunto" }).click();
  await expect(page.getByRole("heading", { name: matterTitle })).toBeVisible();
  await expect(page.getByText(`Cliente: ${revisedClientName}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Novo assunto", exact: true }).click();
  await page.getByLabel("Nome do assunto").fill(`${matterTitle} rascunho não sobrescrito`);
  await page.getByRole("button", { name: `Editar assunto: ${matterTitle}` }).click();
  await expect(page.getByText("Salve ou descarte o formulário atual antes de abrir outro assunto.")).toBeVisible();
  await expect(page.getByLabel("Nome do assunto")).toHaveValue(`${matterTitle} rascunho não sobrescrito`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do assunto" }).click();
  await page.getByRole("button", { name: `Editar assunto: ${matterTitle}` }).click();
  await page.getByLabel("Nome do assunto").fill(renamedMatterTitle);
  await page.getByRole("button", { name: "Salvar alterações do assunto" }).click();
  await expect(page.getByText("Alterações do assunto salvas.")).toBeVisible();
  await expect(page.getByRole("heading", { name: renamedMatterTitle })).toBeVisible();

  await page.getByLabel("Buscar assuntos cadastrados").fill(renamedMatterTitle);
  await page.getByTestId("process-collection-courtCases").click();
  await page.getByLabel("Buscar processos cadastrados").fill("busca de processo preservada");
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByLabel("Buscar assuntos cadastrados")).toHaveValue(renamedMatterTitle);
  await expect(page.getByRole("heading", { name: renamedMatterTitle })).toBeVisible();
  await page.getByTestId("process-collection-courtCases").click();
  await page.getByLabel("Buscar processos cadastrados").fill("");
  await page.getByRole("button", { name: "Encontrar processos por OAB", exact: true }).click();
  await page.getByLabel("Número da OAB", { exact: true }).fill("111111");
  await page.getByLabel("UF da inscrição", { exact: true }).fill("PR");
  const discoveryResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/court-cases/discover-djen");
  await page.getByRole("button", { name: "Buscar publicações no DJEN" }).click();
  const discovery = await discoveryResponse;
  expect(discovery.status()).toBe(200);
  const discoveryBody = await discovery.json();
  expect(discoveryBody).toMatchObject({ page: 1, sourceCount: 6, returnedCount: 5, omittedCount: 1, hasMore: true });
  expect(discoveryBody.items).toEqual([{
    caseNumber: "99999995320998160000", tribunalCode: "TJPR", availableOn: expect.any(String), alreadyRegistered: false,
  }]);
  expect(new URL(discovery.url()).search).toBe("");
  await expect(page.getByText("1 processo encontrado nas páginas consultadas")).toBeVisible();
  await delay(3100); // The two user actions share a three-second source quota.
  await page.getByRole("button", { name: "Carregar próxima página" }).click();
  await expect(page.getByText("2 processos encontrados nas páginas consultadas")).toBeVisible();
  await page.getByRole("button", { name: "Revisar cadastro de 9999999-53.2099.8.16.0000" }).click();
  await expect(courtPicker).toHaveText("TJPR");
  await expect(page.getByLabel("Número CNJ ou identificador local, opcional")).toHaveValue("9999999-53.2099.8.16.0000");
  await expect(page.getByText("Número sugerido a partir de uma publicação do DJEN. Confira os dados antes de cadastrar.")).toBeVisible();
  await page.getByTestId("court-case-form").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar cadastro do processo" }).click();
  await expect(page.getByText("2 processos encontrados nas páginas consultadas")).toBeVisible();
  await page.getByRole("button", { name: "Fechar busca por OAB" }).click();
  await expect(page.getByText("2 processos encontrados nas páginas consultadas")).toHaveCount(0);
  await clickButtonInActiveTab(page, "Novo processo");
  await expect(courtPicker).toBeFocused();
  await courtPicker.click();
  await page.getByRole("button", { name: "TJPR · Tribunal de Justiça do Paraná" }).click();
  await expect(page.getByLabel("Estado ou região do processo")).toHaveValue("PR");
  const caseNumberField = page.getByLabel("Número CNJ ou identificador local, opcional");
  await caseNumberField.fill("0000000-00.9999.8.16.0001");
  await expect(page.getByText("O dígito verificador não confere. Revise os 20 dígitos antes de salvar.")).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByText("Revise os 20 dígitos do número CNJ: o dígito verificador não confere.")).toBeVisible();
  await caseNumberField.fill("0000000-04.9999.8.16.0001");
  await expect(caseNumberField).toHaveValue("0000000-04.9999.8.16.0001");
  await page.getByLabel("Identificação curta, opcional").fill(caseLabel);
  await clickButtonInActiveTab(page, `Selecionar assunto: ${renamedMatterTitle}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByText("Processo cadastrado pela API. Nenhum tribunal foi consultado.")).toBeVisible();
  await expect(page.getByText("Tribunal: Tribunal de Justiça do Paraná").first()).toBeVisible();
  await expect(page.getByText("Número do processo: 0000000-04.9999.8.16.0001").first()).toBeVisible();
  await openTab(page, "Hoje");
  await page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" }).fill(caseLabel);
  await page.getByRole("button", { name: `Abrir processo: ${caseLabel}` }).click();
  expectSearchTermNotInUrl(page, caseLabel);
  await expect(page.getByRole("heading", { name: caseLabel })).toBeVisible();
  await page.getByLabel("Buscar processos cadastrados").fill("");
  const tjprLookupButton = page.getByRole("button", { name: `Abrir consulta pública TJPR (Projudi): ${caseLabel}` });
  await expect(tjprLookupButton).toBeVisible();
  await expect(tjprLookupButton.locator("xpath=..").getByText("Consulta manual no portal oficial. O app não envia o número do processo nem importa o resultado.")).toBeVisible();
  await page.context().route("https://consulta.tjpr.jus.br/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Fixture local Projudi</title>" }));
  const tjprLookupPopup = page.waitForEvent("popup");
  await tjprLookupButton.click();
  const tjprLookupPage = await tjprLookupPopup;
  await expect.poll(() => tjprLookupPage.url()).toBe("https://consulta.tjpr.jus.br/projudi_consulta/processo/consultaPublica.do?actionType=pesquisar");
  await tjprLookupPage.close();
  await page.context().unroute("https://consulta.tjpr.jus.br/**");
  await page.getByRole("button", { name: `Como receber alertas deste tribunal: ${caseLabel}` }).click();
  await expect(page.getByTestId("official-alerts-guide")).toBeVisible();
  await expect(page.getByText("Configuração feita no tribunal · sem sincronização de e-mail com o app")).toBeVisible();
  await expect(page.getByText(/O app mantém a atualização automática desligada até o TJPR confirmar o contrato técnico atual/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir comunicações do CNJ (Jus.br)" })).toBeVisible();
  const alertGuideScreenshot = await page.getByTestId("official-alerts-guide").screenshot();
  await testInfo.attach("tjpr-alerts-guide", { body: alertGuideScreenshot, contentType: "image/png" });
  await page.getByRole("button", { name: `Anotações e contatos: ${caseLabel}` }).click();
  await page.getByLabel("Nova anotação interna do processo").fill(caseNoteBody);
  await page.getByRole("button", { name: "Adicionar anotação ao histórico" }).click();
  await expect(page.getByText("Anotação salva no histórico do processo.")).toBeVisible();
  await expect(page.getByText(caseNoteBody)).toBeVisible();
  const caseListResponse = await request.get(`${E2E_API_BASE_URL}/api/court-cases`, { headers: { Cookie: cookieHeader } });
  expect(caseListResponse.status()).toBe(200);
  const caseList = await caseListResponse.json() as { items: Array<{ id: string; label: string | null }> };
  const notedCase = caseList.items.find((item) => item.label === caseLabel);
  expect(notedCase).toBeDefined();
  const caseNotesResponse = await request.get(`${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/notes`, { headers: { Cookie: cookieHeader } });
  expect(caseNotesResponse.status()).toBe(200);
  const caseNotes = await caseNotesResponse.json() as { items: Array<{ body: string; source: string; caseId: string }> };
  expect(caseNotes.items).toHaveLength(1);
  expect(caseNotes.items[0]).toMatchObject({ body: caseNoteBody, source: "manual", caseId: notedCase!.id });

  const paginationSessionResponse = await request.get(`${E2E_API_BASE_URL}/api/session`, { headers: { Cookie: cookieHeader } });
  expect(paginationSessionResponse.status()).toBe(200);
  const paginationSession = await paginationSessionResponse.json() as { user: { id: string }; tenant: { id: string } };
  const paginationRunId = `${testInfo.project.name}-${testInfo.retry + 1}`;
  seedSyntheticCourtCasePagination(paginationSession.tenant.id, paginationSession.user.id, 55, paginationRunId);
  const firstCourtCasePageResponse = await request.get(`${E2E_API_BASE_URL}/api/court-cases`, { headers: { Cookie: cookieHeader } });
  expect(firstCourtCasePageResponse.status()).toBe(200);
  const firstCourtCasePage = await firstCourtCasePageResponse.json() as { items: Array<{ id: string; label: string | null; createdAt: string }>; nextCursor: string | null };
  expect(firstCourtCasePage.items).toHaveLength(50);
  expect(firstCourtCasePage.nextCursor).toBeTruthy();
  const allCourtCasePages = [...firstCourtCasePage.items];
  let courtCaseCursor = firstCourtCasePage.nextCursor;
  while (courtCaseCursor) {
    const nextResponse = await request.get(`${E2E_API_BASE_URL}/api/court-cases?cursor=${encodeURIComponent(courtCaseCursor)}`, { headers: { Cookie: cookieHeader } });
    expect(nextResponse.status()).toBe(200);
    const nextPage = await nextResponse.json() as typeof firstCourtCasePage;
    expect(nextPage.items.length).toBeGreaterThan(0);
    allCourtCasePages.push(...nextPage.items);
    courtCaseCursor = nextPage.nextCursor;
  }
  expect(allCourtCasePages.filter((item) => item.label?.startsWith(`E2E ${paginationRunId} paginação de processo `))).toHaveLength(55);
  expect(new Set(allCourtCasePages.map((item) => item.id)).size).toBe(allCourtCasePages.length);
  for (let index = 1; index < allCourtCasePages.length; index += 1) {
    const previous = allCourtCasePages[index - 1]!;
    const current = allCourtCasePages[index]!;
    expect(previous.createdAt > current.createdAt || (previous.createdAt === current.createdAt && previous.id > current.id)).toBe(true);
  }
  const malformedCourtCaseCursor = await request.get(`${E2E_API_BASE_URL}/api/court-cases?cursor=not-a-cursor`, { headers: { Cookie: cookieHeader } });
  expect(malformedCourtCaseCursor.status()).toBe(400);
  const duplicateCourtCaseCursor = await request.get(`${E2E_API_BASE_URL}/api/court-cases?cursor=${encodeURIComponent(firstCourtCasePage.nextCursor!)}&cursor=${encodeURIComponent(firstCourtCasePage.nextCursor!)}`, { headers: { Cookie: cookieHeader } });
  expect(duplicateCourtCaseCursor.status()).toBe(400);

  const pageTwoOnlyCaseLabel = `E2E ${paginationRunId} paginação de processo 000`;
  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Processos");
  await page.getByLabel("Buscar processos cadastrados").fill(pageTwoOnlyCaseLabel);
  await expect(page.getByText("Nenhum processo correspondente entre os processos carregados. Há mais registros para consultar.")).toBeVisible();
  await expect(page.getByText("A busca considera os 50 processos já carregados. Carregue mais para ampliar a busca.")).toBeVisible();
  await page.getByRole("button", { name: "Carregar mais processos" }).click();
  await expect(page.getByText(pageTwoOnlyCaseLabel, { exact: true })).toBeVisible();
  await page.getByLabel("Buscar processos cadastrados").fill("");

  await page.getByRole("button", { name: `Acompanhamento de publicações do DJEN: ${caseLabel}` }).click();
  const publicationSyncResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/publications/sync"));
  await page.getByRole("button", { name: "Consultar publicações agora" }).click();
  expect((await publicationSyncResponse).status()).toBe(200);
  await expect(page.getByText("Comunicado sintético para teste")).toBeVisible();
  await expect(page.getByText("Disponibilizada em 2099-01-02 · TJXX", { exact: true })).toBeVisible();
  await expect(page.getByText("Pendente de conferência interna")).toBeVisible();
  const publicationListUrl = `${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/publications`;
  const pendingPublicationResponse = await request.get(publicationListUrl, { headers: { Cookie: cookieHeader } });
  expect(pendingPublicationResponse.status()).toBe(200);
  const pendingPublications = await pendingPublicationResponse.json() as {
    items: Array<{ sourceHash: string; review: { status: string; updatedAt: string | null } }>;
    sync: { status: string; returnedCount: number; warningCode: string | null };
  };
  expect(pendingPublications.sync).toMatchObject({ status: "items_returned", returnedCount: 1, warningCode: "coverage_unverified" });
  const pendingPublication = pendingPublications.items.find((item) => item.sourceHash === "e2eSyntheticPublicationHash001");
  expect(pendingPublication?.review).toEqual({ status: "pending", reviewedAt: null, updatedAt: null });
  const forgedReview = await request.post(`${publicationListUrl}/${pendingPublication!.sourceHash}/review`, {
    headers: { Cookie: cookieHeader }, data: { status: "reviewed", expectedUpdatedAt: null, tenantId: "tenant-forjado-e2e" },
  });
  expect(forgedReview.status()).toBe(400);
  await page.getByRole("button", { name: "Marcar publicação como conferida" }).click();
  await expect(page.getByText("Marcada como conferida internamente. Isso não confirma ciência nem prazo processual.")).toBeVisible();
  await expect(page.getByText("Conferida internamente").first()).toBeVisible();
  const reviewedPublicationResponse = await request.get(publicationListUrl, { headers: { Cookie: cookieHeader } });
  const reviewedPublications = await reviewedPublicationResponse.json() as { items: Array<{ sourceHash: string; review: { status: string; reviewedAt: string | null; updatedAt: string | null } }> };
  const reviewedPublication = reviewedPublications.items.find((item) => item.sourceHash === "e2eSyntheticPublicationHash001");
  expect(reviewedPublication?.review.status).toBe("reviewed");
  expect(reviewedPublication?.review.reviewedAt).toBeTruthy();
  expect(reviewedPublication?.review.updatedAt).toBeTruthy();
  const replayedInitialReview = await request.post(`${publicationListUrl}/${pendingPublication!.sourceHash}/review`, {
    headers: { Cookie: cookieHeader }, data: { status: "reviewed", expectedUpdatedAt: null },
  });
  expect(replayedInitialReview.status()).toBe(409);
  await page.getByRole("button", { name: "Voltar para pendentes de conferência" }).click();
  await expect(page.getByText("Publicação devolvida para conferência interna.")).toBeVisible();
  await expect(page.getByText("Pendente de conferência interna")).toBeVisible();
  const reopenedPublicationResponse = await request.get(publicationListUrl, { headers: { Cookie: cookieHeader } });
  const reopenedPublications = await reopenedPublicationResponse.json() as { items: Array<{ sourceHash: string; review: { status: string; updatedAt: string | null } }> };
  const reopenedPublication = reopenedPublications.items.find((item) => item.sourceHash === "e2eSyntheticPublicationHash001");
  expect(reopenedPublication?.review.status).toBe("pending");
  const pendingReviewUpdatedAt = reopenedPublication!.review.updatedAt;
  const forgedCaseNote = await request.post(`${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/notes`, {
    headers: { Cookie: cookieHeader }, data: { body: "Tentativa entre escritórios", tenantId: "tenant-forjado-e2e" },
  });
  expect(forgedCaseNote.status()).toBe(400);
  const deleteCaseNotes = await request.delete(`${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/notes`, { headers: { Cookie: cookieHeader } });
  expect(deleteCaseNotes.status()).toBe(405);
  expect(deleteCaseNotes.headers()["allow"]).toBe("GET, POST, OPTIONS");
  const browserDeleteResult = await page.evaluate(async (url) => {
    const response = await fetch(url, { method: "DELETE", credentials: "include" });
    return response.status;
  }, `${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/notes`);
  expect(browserDeleteResult).toBe(405);
  await page.getByRole("button", { name: `Editar processo: ${caseLabel}` }).click();
  await page.getByLabel("Estado ou região do processo").fill("RS");
  await page.getByLabel("Identificação curta, opcional").fill(revisedCaseLabel);
  await page.getByRole("button", { name: "Salvar alterações do processo" }).click();
  await expect(page.getByText("Alterações do processo salvas. Nenhum tribunal foi consultado.")).toBeVisible();
  await expect(page.getByText("Estado ou região: RS").first()).toBeVisible();
  await page.getByRole("button", { name: `Arquivar processo: ${revisedCaseLabel}` }).click();
  await expect(page.getByText("O processo ficará arquivado e continuará disponível no histórico. Confirma?")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar arquivamento do processo" }).click();
  await page.getByRole("button", { name: `Arquivar processo: ${revisedCaseLabel}` }).click();
  await page.getByRole("button", { name: `Confirmar arquivamento do processo: ${revisedCaseLabel}` }).click();
  await expect(page.getByText(`Processo arquivado: ${revisedCaseLabel}.`)).toBeVisible();
  const archivedCaseNote = await request.post(`${E2E_API_BASE_URL}/api/court-cases/${notedCase!.id}/notes`, {
    headers: { Cookie: cookieHeader }, data: { body: `${fixture} — não deveria ser aceito em caso arquivado` },
  });
  expect(archivedCaseNote.status()).toBe(409);
  const archivedPublicationReview = await request.post(`${publicationListUrl}/e2eSyntheticPublicationHash001/review`, {
    headers: { Cookie: cookieHeader }, data: { status: "reviewed", expectedUpdatedAt: pendingReviewUpdatedAt },
  });
  expect(archivedPublicationReview.status()).toBe(409);
  await page.getByRole("button", { name: `Reativar processo: ${revisedCaseLabel}` }).click();
  await expect(page.getByText(`Processo reativado: ${revisedCaseLabel}.`)).toBeVisible();

  const forgedTenant = await request.post(`${E2E_API_BASE_URL}/api/matters`, {
    headers: { Cookie: cookieHeader },
    data: { title: "Tentativa inválida de tenant", tenantId: "tenant-forjado-e2e" },
  });
  expect(forgedTenant.status()).toBe(400);

  await openTab(page, "Agenda");
  await expect(page.getByTestId("agenda-task-form")).toHaveCount(0);
  await expect(page.getByTestId("agenda-appointment-form")).toHaveCount(0);
  await expect(page.getByText("Calendário mensal")).toBeVisible();
  await selectAgendaView(page, "tasks");
  await expect(page.getByRole("heading", { name: "Tarefas cadastradas", exact: true })).toBeVisible();
  await expect(page.getByTestId("agenda-task-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await expect(page.getByTestId("agenda-task-form")).toBeVisible();
  await expect(page.getByLabel("Título da tarefa")).toBeFocused();
  await page.getByLabel("Título da tarefa").fill(taskTitle);
  await page.getByRole("button", { name: "Fechar formulário de tarefa" }).click();
  await expect(page.getByTestId("agenda-task-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar tarefa" }).click();
  await expect(page.getByLabel("Título da tarefa")).toHaveValue(taskTitle);
  await page.getByLabel("Data da tarefa (DD/MM/AAAA, opcional)").fill("31/02/2026");
  await clickButtonInActiveTab(page, `Selecionar assunto: ${renamedMatterTitle}`);
  await page.getByRole("button", { name: "Cadastrar tarefa" }).click();
  await expect(page.getByText("Informe uma data válida no formato DD/MM/AAAA ou deixe o campo vazio.")).toBeVisible();
  await page.getByLabel("Data da tarefa (DD/MM/AAAA, opcional)").fill(taskSchedule.input);
  await page.getByRole("button", { name: "Cadastrar tarefa" }).click();
  await expect(page.getByText(taskTitle).first()).toBeVisible();
  await expect(page.getByText(`Organizada para ${taskSchedule.input}`).first()).toBeVisible();
  await expect(page.getByText(`Assunto: ${renamedMatterTitle}`).first()).toBeVisible();
  await openTab(page, "Hoje");
  await page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" }).fill(taskTitle);
  await page.getByRole("button", { name: `Abrir tarefa: ${taskTitle}` }).click();
  expectSearchTermNotInUrl(page, taskTitle);
  await expect(page.getByText(`Resultados para “${taskTitle}”`)).toBeVisible();
  await expect(page.getByText(taskTitle, { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca da agenda" }).click();
  await expect(page.getByLabel(`Assunto da tarefa ${taskTitle}: ${renamedMatterTitle}`).last()).toBeVisible();
  await selectAgendaView(page, "calendar");
  const selectedDayLabel = await selectAgendaDay(page, taskSchedule.iso);
  const selectedMonthLabel = await page.getByTestId("agenda-month-title").innerText();
  await page.getByRole("button", { name: "Criar tarefa para este dia" }).click();
  await expect(page.getByLabel("Data da tarefa (DD/MM/AAAA, opcional)")).toHaveValue(taskSchedule.input);
  await page.getByRole("button", { name: "Cancelar cadastro da tarefa" }).click();
  await page.getByRole("button", { name: "Descartar cadastro da tarefa" }).click();
  await expect(page.getByTestId("agenda-task-form")).toHaveCount(0);
  await selectAgendaView(page, "calendar");
  await expect(page.getByTestId("agenda-month-title")).toHaveText(selectedMonthLabel);
  await expect(page.getByTestId("agenda-selected-day")).toBeVisible();
  await expect.poll(() => page.getByTestId("agenda-selected-day").getAttribute("aria-label"))
    .toContain(selectedDayLabel);
  await page.getByRole("button", { name: "Criar compromisso para este dia" }).click();
  await expect(page.getByLabel("Data do compromisso (DD/MM/AAAA)")).toHaveValue(taskSchedule.input);
  await page.getByRole("button", { name: "Cancelar cadastro do compromisso" }).click();
  await page.getByRole("button", { name: "Descartar cadastro do compromisso" }).click();
  await expect(page.getByTestId("agenda-appointment-form")).toHaveCount(0);
  await selectAgendaView(page, "calendar");
  await selectAgendaDay(page, taskSchedule.iso);
  await expect(await activeTabElement(page.getByText("TAREFA", { exact: true }))).toBeVisible();
  await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible();
  await openTab(page, "Processos");
  await page.getByTestId("process-collection-clients").click();
  await (await activeTabElement(page.getByRole("button", { name: `Arquivar cliente: ${revisedClientName}` }))).click();
  await expect(page.getByText("O cadastro ficará arquivado e continuará disponível nos assuntos já vinculados. Confirma?")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar arquivamento do cliente" }).click();
  await (await activeTabElement(page.getByRole("button", { name: `Arquivar cliente: ${revisedClientName}` }))).click();
  await (await activeTabElement(page.getByRole("button", { name: `Confirmar arquivamento do cliente: ${revisedClientName}` }))).click();
  await expect(page.getByText(`Cliente arquivado: ${revisedClientName}.`)).toBeVisible();
  await page.getByRole("button", { name: "Voltar para processos" }).click();
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByText(`Cliente: ${revisedClientName} · cliente arquivado`, { exact: true })).toBeVisible();
  await page.getByTestId("process-collection-clients").click();
  await (await activeTabElement(page.getByRole("button", { name: `Reativar cliente: ${revisedClientName}` }))).click();
  await expect(page.getByText(`Cliente reativado: ${revisedClientName}.`)).toBeVisible();
  await page.getByRole("button", { name: "Voltar para processos" }).click();
  await page.getByTestId("process-collection-matters").click();
  await expect(page.getByText(`Cliente: ${revisedClientName}`, { exact: true })).toBeVisible();
  await openTab(page, "Agenda");
  const mattersResponse = await request.get(`${E2E_API_BASE_URL}/api/matters`, { headers: { Cookie: cookieHeader } });
  expect(mattersResponse.status()).toBe(200);
  const mattersList = await mattersResponse.json() as { items: Array<{ id: string; title: string; updatedAt: string; status: string; client: { id: string; displayName: string; status: string } | null }> };
  const linkedMatter = mattersList.items.find((matter) => matter.title === renamedMatterTitle);
  expect(linkedMatter).toBeDefined();
  expect(linkedMatter?.client?.id).toBe(linkedClient!.id);
  expect(linkedMatter?.client?.displayName).toBe(revisedClientName);
  const tasksAfterCreateResponse = await request.get(`${E2E_API_BASE_URL}/api/tasks`, { headers: { Cookie: cookieHeader } });
  expect(tasksAfterCreateResponse.status()).toBe(200);
  const tasksAfterCreate = await tasksAfterCreateResponse.json() as { items: Array<{ id: string; title: string; matterId: string | null; scheduledOn: string | null }> };
  expect(tasksAfterCreate.items.find((task) => task.title === taskTitle)).toMatchObject({ matterId: linkedMatter!.id, scheduledOn: taskSchedule.iso });
  await openTab(page, "Processos");
  await page.getByRole("button", { name: `Arquivar assunto: ${renamedMatterTitle}` }).click();
  await expect(page.getByText("O assunto ficará arquivado. O histórico e as tarefas vinculadas continuarão visíveis. Confirma?")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar arquivamento do assunto" }).click();
  await page.getByRole("button", { name: `Arquivar assunto: ${renamedMatterTitle}` }).click();
  await page.getByRole("button", { name: `Confirmar arquivamento do assunto: ${renamedMatterTitle}` }).click();
  await expect(page.getByText(`Assunto arquivado: ${renamedMatterTitle}.`)).toBeVisible();
  const newTaskForArchivedMatter = await request.post(`${E2E_API_BASE_URL}/api/tasks`, {
    headers: { Cookie: cookieHeader }, data: { title: `${fixture} — Tarefa inválida`, matterId: linkedMatter!.id },
  });
  expect(newTaskForArchivedMatter.status()).toBe(404);
  const mattersAfterArchiveResponse = await request.get(`${E2E_API_BASE_URL}/api/matters`, { headers: { Cookie: cookieHeader } });
  expect(mattersAfterArchiveResponse.status()).toBe(200);
  const mattersAfterArchive = await mattersAfterArchiveResponse.json() as { items: Array<{ id: string; status: string }> };
  expect(mattersAfterArchive.items.find((matter) => matter.id === linkedMatter!.id)?.status).toBe("archived");
  await page.reload();
  await openTab(page, "Hoje");
  await expect(page.getByLabel(`Assunto da tarefa ${taskTitle}: ${renamedMatterTitle} (arquivado)`).first()).toBeVisible();
  await openTab(page, "Agenda");
  await selectAgendaView(page, "tasks");
  await expect(page.getByText(/não prazo judicial/i).first()).toBeVisible();
  await page.getByRole("button", { name: `Editar tarefa: ${taskTitle}` }).click();
  await page.getByLabel("Título da tarefa").fill(renamedTaskTitle);
  await page.getByLabel("Data da tarefa (DD/MM/AAAA, opcional)").fill(revisedTaskSchedule.input);
  await page.getByRole("button", { name: "Remover vínculo com assunto" }).click();
  await page.getByRole("button", { name: "Salvar alterações da tarefa" }).click();
  await expect(page.getByText("Alterações da tarefa salvas.")).toBeVisible();
  await expect(page.getByText(renamedTaskTitle).first()).toBeVisible();
  await expect(page.getByText(`Organizada para ${revisedTaskSchedule.input}`).first()).toBeVisible();
  await expect(page.getByLabel(`Assunto da tarefa ${renamedTaskTitle}: Sem assunto vinculado`).last()).toBeVisible();
  await openTab(page, "Processos");
  const mattersCollection = page.getByTestId("process-collection-matters");
  await mattersCollection.click();
  await expect(mattersCollection).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: `Reativar assunto: ${renamedMatterTitle}` }).click();
  await expect(page.getByText(`Assunto reativado: ${renamedMatterTitle}.`)).toBeVisible();
  await openTab(page, "Agenda");
  const tasksAfterEditResponse = await request.get(`${E2E_API_BASE_URL}/api/tasks`, { headers: { Cookie: cookieHeader } });
  expect(tasksAfterEditResponse.status()).toBe(200);
  const tasksAfterEdit = await tasksAfterEditResponse.json() as { items: Array<{ id: string; title: string; matterId: string | null; scheduledOn: string | null; updatedAt: string }> };
  const editedTask = tasksAfterEdit.items.find((task) => task.title === renamedTaskTitle);
  expect(editedTask?.matterId).toBeNull();
  expect(editedTask?.scheduledOn).toBe(revisedTaskSchedule.iso);
  expect(editedTask).toBeDefined();
  const concurrentTaskStatus = await request.post(`${E2E_API_BASE_URL}/api/tasks/${editedTask!.id}/status`, {
    headers: { Cookie: cookieHeader }, data: { status: "done", expectedUpdatedAt: editedTask!.updatedAt },
  });
  expect(concurrentTaskStatus.status()).toBe(200);
  await page.getByRole("button", { name: `Concluir tarefa: ${renamedTaskTitle}` }).click();
  await expect(page.getByText("Esse registro mudou em outra tela. A lista foi atualizada; confira o estado antes de tentar novamente.")).toBeVisible();
  await expect(page.getByLabel(`Status da tarefa ${renamedTaskTitle}: Concluída`)).toBeVisible();

  await selectAgendaView(page, "calendar");
  await expect(page.getByTestId("agenda-appointment-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Novo compromisso", exact: true }).click();
  await expect(page.getByLabel("Título do compromisso")).toBeFocused();
  await page.getByLabel("Título do compromisso").fill(appointmentTitle);
  await page.getByLabel("Data do compromisso (DD/MM/AAAA)").fill(appointmentSchedule.input);
  await page.getByLabel("Horário de início (HH:MM)").fill("14:00");
  await page.getByLabel("Horário de término (HH:MM)").fill("15:00");
  await page.getByRole("button", { name: "Cadastrar compromisso" }).click();
  await expect(page.getByText("Compromisso cadastrado no escritório.").first()).toBeVisible();
  const invalidTimezoneAppointment = await request.post(`${E2E_API_BASE_URL}/api/appointments`, {
    headers: { Cookie: cookieHeader },
    data: {
      title: `${fixture} — fuso inválido`,
      startsAt: "2030-01-01T10:00:00.000Z",
      endsAt: "2030-01-01T11:00:00.000Z",
      timezone: "Mars/Olympus",
    },
  });
  expect(invalidTimezoneAppointment.status()).toBe(400);
  await expect(page.getByText(appointmentTitle).first()).toBeVisible();
  await selectAgendaDay(page, appointmentSchedule.iso);
  await expect(page.getByText("COMPROMISSO", { exact: true })).toBeVisible();
  await expect(page.getByText(appointmentTitle, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: `Editar compromisso: ${appointmentTitle}` }).click();
  await page.getByLabel("Título do compromisso").fill(revisedAppointmentTitle);
  await page.getByLabel("Horário de início (HH:MM)").fill("15:00");
  await page.getByLabel("Horário de término (HH:MM)").fill("16:00");
  await page.getByLabel("Local do compromisso (opcional)").fill("Local sintético 1");
  await page.getByRole("button", { name: "Salvar alterações do compromisso" }).click();
  await expect(page.getByText("Alterações do compromisso salvas.")).toBeVisible();
  await expect(page.getByText(revisedAppointmentTitle).first()).toBeVisible();
  await page.getByRole("button", { name: `Cancelar compromisso: ${revisedAppointmentTitle}` }).click();
  await expect(page.getByRole("button", { name: `Confirmar cancelamento: ${revisedAppointmentTitle}` })).toBeVisible();
  await page.getByRole("button", { name: `Manter compromisso: ${revisedAppointmentTitle}` }).click();
  await expect(page.getByLabel(`Status do compromisso ${revisedAppointmentTitle}: Agendado`)).toBeVisible();
  await page.getByRole("button", { name: `Cancelar compromisso: ${revisedAppointmentTitle}` }).click();
  await page.getByRole("button", { name: `Confirmar cancelamento: ${revisedAppointmentTitle}` }).click();
  await expect(page.getByText("Compromisso cancelado.")).toBeVisible();
  await expect(page.getByLabel(`Status do compromisso ${revisedAppointmentTitle}: Cancelado`)).toBeVisible();

  if (browserName === "chromium") {
    const timezoneContext = await browser.newContext({
      baseURL: `${E2E_WEB_BASE_URL}`,
      timezoneId: "America/New_York",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const ownerCookies = await page.context().cookies(`${E2E_API_BASE_URL}`);
      await timezoneContext.addCookies(ownerCookies);
      const timezonePage = await timezoneContext.newPage();
      await timezonePage.goto("/");
      await expect(timezonePage.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
      await openTab(timezonePage, "Agenda");
      await timezonePage.getByRole("button", { name: "Novo compromisso", exact: true }).click();
      await expect(timezonePage.getByText(/Horários no fuso America\/New_York/)).toBeVisible();
      await timezonePage.getByLabel("Título do compromisso").fill(`${fixture} — horário inexistente DST`);
      await timezonePage.getByLabel("Data do compromisso (DD/MM/AAAA)").fill("14/03/2027");
      await timezonePage.getByLabel("Horário de início (HH:MM)").fill("02:30");
      await timezonePage.getByLabel("Horário de término (HH:MM)").fill("03:30");
      await timezonePage.getByRole("button", { name: "Cadastrar compromisso" }).click();
      await expect(timezonePage.getByText(/Esse horário não existe no fuso escolhido/)).toBeVisible();

      await timezonePage.getByLabel("Título do compromisso").fill(`${fixture} — horário ambíguo DST`);
      await timezonePage.getByLabel("Data do compromisso (DD/MM/AAAA)").fill("07/11/2027");
      await timezonePage.getByLabel("Horário de início (HH:MM)").fill("01:30");
      await timezonePage.getByLabel("Horário de término (HH:MM)").fill("02:30");
      await timezonePage.getByRole("button", { name: "Cadastrar compromisso" }).click();
      await expect(timezonePage.getByText(/Esse horário ocorre duas vezes no fuso escolhido/)).toBeVisible();
    } finally {
      await timezoneContext.close();
    }
  }

  await openTab(page, "Pesquisa");
  const researchGuide = page.getByTestId("research-source-guidance");
  await expect(researchGuide).toContainText("Comece pela pesquisa livre");
  await page.getByRole("radio", { name: "TJSC — Justiça estadual de Santa Catarina" }).click();
  await expect(researchGuide).toContainText("combine ideias com E, OU ou NÃO.");
  await expect(page.getByRole("button", { name: "Ler guia oficial do TJSC" })).toBeVisible();
  await page.getByRole("radio", { name: "TRF4 — Justiça Federal da 4ª Região" }).click();
  await expect(researchGuide).toContainText("Escolha a origem da decisão");
  if (browserName !== "webkit") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Questão jurídica para pesquisar").fill(researchQuery);
  await page.getByRole("radio", { name: "TRF4 — Justiça Federal da 4ª Região" }).click();
  await page.getByRole("button", { name: "Copiar termos da busca" }).click();
  await expect(page.getByText(/Consulta copiada/i)).toBeVisible();
  if (browserName !== "webkit") {
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(researchQuery);
  }
  const sourcePopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir pesquisa oficial TRF4" }).click();
  const sourcePage = await sourcePopup;
  await expect.poll(() => sourcePage.url()).toContain("trf4.jus.br");
  await sourcePage.close();
  await page.getByRole("button", { name: "Salvar busca no escritório" }).click();
  await expect(page.getByText("Busca salva no escritório. Os resultados precisam ser conferidos na fonte oficial.")).toBeVisible();
  await expect(page.getByText(researchQuery).first()).toBeVisible();
  const researchesResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches`, { headers: { Cookie: cookieHeader } });
  expect(researchesResponse.status()).toBe(200);
  const researches = await researchesResponse.json() as { items: Array<{ id: string; query: string; courtId: string; sourceUrl: string; createdAt: string; updatedAt: string; archivedAt: string | null }> };
  const savedResearch = researches.items.find((item) => item.query === researchQuery);
  expect(savedResearch).toBeDefined();
  expect(savedResearch).toMatchObject({ courtId: "TRF4", archivedAt: null });
  expect(savedResearch?.updatedAt).toBe(savedResearch?.createdAt);
  const repeatedSavedResearch = await request.post(`${E2E_API_BASE_URL}/api/legal-researches`, {
    headers: { Cookie: cookieHeader }, data: { query: researchQuery, courtId: "TRF4" },
  });
  expect(repeatedSavedResearch.status()).toBe(200);
  expect((await repeatedSavedResearch.json() as { item: { id: string } }).item.id).toBe(savedResearch!.id);
  const concurrentResearchQuery = `${fixture} — busca salva sob retry concorrente`;
  const concurrentResearchRetries = await Promise.all([0, 1].map(() => request.post(`${E2E_API_BASE_URL}/api/legal-researches`, {
    headers: { Cookie: cookieHeader }, data: { query: concurrentResearchQuery, courtId: "TRF4" },
  })));
  expect(concurrentResearchRetries.map((response) => response.status()).sort()).toEqual([200, 201]);
  const concurrentResearchItems = await Promise.all(concurrentResearchRetries.map(async (response) => (await response.json() as { item: { id: string } }).item));
  expect(concurrentResearchItems[0]!.id).toBe(concurrentResearchItems[1]!.id);
  await page.getByRole("button", { name: `Editar consulta salva: ${researchQuery}` }).click();
  await page.getByLabel("Editar termos da consulta salva").fill(revisedResearchQuery);
  await page.getByRole("radio", { name: "Tribunal da consulta salva TJPR" }).click();
  await page.getByRole("button", { name: "Salvar alterações da consulta" }).click();
  await expect(page.getByText("Alterações da consulta salvas.")).toBeVisible();
  await expect(page.getByText(revisedResearchQuery, { exact: true })).toBeVisible();
  const editedResearchesResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches`, { headers: { Cookie: cookieHeader } });
  const editedResearches = await editedResearchesResponse.json() as { items: Array<{ id: string; query: string; courtId: string; sourceUrl: string; updatedAt: string; archivedAt: string | null }> };
  const editedResearch = editedResearches.items.find((item) => item.id === savedResearch!.id);
  expect(editedResearch).toMatchObject({ query: revisedResearchQuery, courtId: "TJPR", archivedAt: null });
  expect(editedResearch?.sourceUrl).toContain("tjpr.jus.br");
  expect(editedResearch?.updatedAt).not.toBe(savedResearch?.updatedAt);
  const staleResearchEdit = await request.patch(`${E2E_API_BASE_URL}/api/legal-researches/${savedResearch!.id}`, {
    headers: { Cookie: cookieHeader }, data: { query: researchQuery, courtId: "TRF4", expectedUpdatedAt: savedResearch!.updatedAt },
  });
  expect(staleResearchEdit.status()).toBe(409);
  const forgedResearchEdit = await request.patch(`${E2E_API_BASE_URL}/api/legal-researches/${savedResearch!.id}`, {
    headers: { Cookie: cookieHeader }, data: { query: researchQuery, courtId: "TRF4", expectedUpdatedAt: editedResearch!.updatedAt, tenantId: "tenant-forjado-e2e" },
  });
  expect(forgedResearchEdit.status()).toBe(400);
  const hardDeleteResearch = await request.delete(`${E2E_API_BASE_URL}/api/legal-researches/${savedResearch!.id}`, { headers: { Cookie: cookieHeader } });
  expect(hardDeleteResearch.status()).toBe(405);
  await page.getByRole("button", { name: `Arquivar consulta salva: ${revisedResearchQuery}` }).click();
  await page.getByRole("button", { name: `Confirmar arquivamento da consulta: ${revisedResearchQuery}` }).click();
  await expect(page.getByText("Consulta arquivada. Você pode restaurá-la em Consultas arquivadas.")).toBeVisible();
  await expect(page.getByText(revisedResearchQuery, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver consultas arquivadas" }).click();
  await expect(page.getByText(revisedResearchQuery, { exact: true })).toBeVisible();
  await expect(page.getByText("Arquivada · pode ser restaurada").first()).toBeVisible();
  await page.getByRole("button", { name: `Restaurar consulta salva: ${revisedResearchQuery}` }).click();
  await expect(page.getByText("Consulta restaurada nas buscas recentes.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buscas recentes" })).toBeVisible();
  await expect(page.getByText("Arquivada · pode ser restaurada")).toHaveCount(0);
  await expect(page.getByText(revisedResearchQuery, { exact: true })).toBeVisible();
  const restoredResearchesResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?includeArchived=true`, { headers: { Cookie: cookieHeader } });
  const restoredResearches = await restoredResearchesResponse.json() as { items: Array<{ id: string; archivedAt: string | null }> };
  expect(restoredResearches.items.find((item) => item.id === savedResearch!.id)?.archivedAt).toBeNull();

  const paginationFixtureQueries = Array.from({ length: 105 }, (_, index) => `${fixture} — busca paginada ${String(index + 1).padStart(3, "0")}`);
  for (let offset = 0; offset < paginationFixtureQueries.length; offset += 10) {
    const chunk = paginationFixtureQueries.slice(offset, offset + 10);
    const responses = await Promise.all(chunk.map((query) => request.post(`${E2E_API_BASE_URL}/api/legal-researches`, {
      headers: { Cookie: cookieHeader }, data: { query, courtId: "TRF4" },
    })));
    for (const response of responses) expect(response.status()).toBe(201);
  }

  const allResearchesByCursor: Array<{ id: string; query: string; createdAt: string; updatedAt: string }> = [];
  const firstResearchPageResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=active`, { headers: { Cookie: cookieHeader } });
  expect(firstResearchPageResponse.status()).toBe(200);
  const firstResearchPage = await firstResearchPageResponse.json() as { items: typeof allResearchesByCursor; nextCursor: string | null };
  expect(firstResearchPage.items).toHaveLength(50);
  expect(firstResearchPage.nextCursor).toBeTruthy();
  allResearchesByCursor.push(...firstResearchPage.items);
  let cursor = firstResearchPage.nextCursor;
  let researchBeyondFirstPage: string | null = null;
  while (cursor) {
    const nextPageResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=active&cursor=${encodeURIComponent(cursor)}`, { headers: { Cookie: cookieHeader } });
    expect(nextPageResponse.status()).toBe(200);
    const nextPage = await nextPageResponse.json() as { items: typeof allResearchesByCursor; nextCursor: string | null };
    expect(nextPage.items.length).toBeGreaterThan(0);
    if (!researchBeyondFirstPage) researchBeyondFirstPage = nextPage.items.find((item) => paginationFixtureQueries.includes(item.query))?.query ?? null;
    allResearchesByCursor.push(...nextPage.items);
    cursor = nextPage.nextCursor;
  }
  expect(researchBeyondFirstPage).not.toBeNull();
  expect(new Set(allResearchesByCursor.map((item) => item.id)).size).toBe(allResearchesByCursor.length);
  expect(allResearchesByCursor.filter((item) => paginationFixtureQueries.includes(item.query))).toHaveLength(105);
  for (let index = 1; index < allResearchesByCursor.length; index += 1) {
    const previous = allResearchesByCursor[index - 1]!;
    const current = allResearchesByCursor[index]!;
    expect(previous.createdAt > current.createdAt || (previous.createdAt === current.createdAt && previous.id > current.id)).toBe(true);
  }
  const malformedResearchCursor = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=active&cursor=not-a-cursor`, { headers: { Cookie: cookieHeader } });
  expect(malformedResearchCursor.status()).toBe(400);
  const wrongModeCursor = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=archived&cursor=${encodeURIComponent(firstResearchPage.nextCursor!)}`, { headers: { Cookie: cookieHeader } });
  expect(wrongModeCursor.status()).toBe(400);

  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Pesquisa");
  await expect(page.getByText(paginationFixtureQueries.at(-1)!, { exact: true })).toBeVisible();
  await expect(page.getByText(researchBeyondFirstPage!, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Carregar mais buscas" }).click();
  await expect(page.getByText(researchBeyondFirstPage!, { exact: true })).toBeVisible();

  const paginationEntries = allResearchesByCursor.filter((item) => paginationFixtureQueries.includes(item.query));
  for (let offset = 0; offset < paginationEntries.length; offset += 10) {
    const chunk = paginationEntries.slice(offset, offset + 10);
    const responses = await Promise.all(chunk.map((item) => request.post(`${E2E_API_BASE_URL}/api/legal-researches/${item.id}/status`, {
      headers: { Cookie: cookieHeader }, data: { status: "archived", expectedUpdatedAt: item.updatedAt },
    })));
    for (const response of responses) expect(response.status()).toBe(200);
  }
  const archivedPages: Array<{ id: string; query: string }> = [];
  const firstArchivedResponse = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=archived`, { headers: { Cookie: cookieHeader } });
  expect(firstArchivedResponse.status()).toBe(200);
  const firstArchivedPage = await firstArchivedResponse.json() as { items: typeof archivedPages; nextCursor: string | null };
  expect(firstArchivedPage.items).toHaveLength(50);
  expect(firstArchivedPage.items.every((item) => paginationFixtureQueries.includes(item.query))).toBe(true);
  archivedPages.push(...firstArchivedPage.items);
  let archivedCursor = firstArchivedPage.nextCursor;
  let archivedBeyondFirstPage: string | null = null;
  while (archivedCursor) {
    const response = await request.get(`${E2E_API_BASE_URL}/api/legal-researches?status=archived&cursor=${encodeURIComponent(archivedCursor)}`, { headers: { Cookie: cookieHeader } });
    expect(response.status()).toBe(200);
    const nextPage = await response.json() as { items: typeof archivedPages; nextCursor: string | null };
    if (!archivedBeyondFirstPage) archivedBeyondFirstPage = nextPage.items.find((item) => paginationFixtureQueries.includes(item.query))?.query ?? null;
    archivedPages.push(...nextPage.items);
    archivedCursor = nextPage.nextCursor;
  }
  expect(archivedPages.filter((item) => paginationFixtureQueries.includes(item.query))).toHaveLength(105);
  expect(new Set(archivedPages.map((item) => item.id)).size).toBe(archivedPages.length);
  expect(archivedBeyondFirstPage).not.toBeNull();
  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Pesquisa");
  await expect(page.getByText(revisedResearchQuery, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver consultas arquivadas" }).click();
  await expect(page.getByText(firstArchivedPage.items[0]!.query, { exact: true })).toBeVisible();
  await expect(page.getByText(archivedBeyondFirstPage!, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Carregar mais consultas arquivadas" }).click();
  await expect(page.getByText(archivedBeyondFirstPage!, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às buscas recentes" }).click();

  await openTab(page, "Hoje");
  await page.getByRole("button", { name: "Criar rascunho para redes sociais" }).click();
  await expect(page.getByRole("heading", { name: "Conteúdo para compartilhar" })).toBeVisible();
  await page.getByRole("radio", { name: "TikTok" }).click();
  await page.getByLabel("Tema informativo").fill(socialDraftTopic);
  await page.getByLabel("Texto do rascunho").fill(socialDraftContent);
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo no escritório. Nenhuma rede social foi acessada.")).toBeVisible();
  const socialDraftsResponse = await request.get(`${E2E_API_BASE_URL}/api/social-drafts`, { headers: { Cookie: cookieHeader } });
  expect(socialDraftsResponse.status()).toBe(200);
  const socialDrafts = await socialDraftsResponse.json() as { items: Array<{ id: string; platform: string; topic: string; content: string; updatedAt: string }> };
  const savedSocialDraft = socialDrafts.items.find((draft) => draft.topic === socialDraftTopic);
  expect(savedSocialDraft).toMatchObject({ platform: "tiktok", content: socialDraftContent });
  const concurrentSocialDraftUpdate = await request.patch(`${E2E_API_BASE_URL}/api/social-drafts/${savedSocialDraft!.id}`, {
    headers: { Cookie: cookieHeader },
    data: { platform: "tiktok", topic: socialDraftTopic, content: concurrentSocialDraftContent, expectedUpdatedAt: savedSocialDraft!.updatedAt },
  });
  expect(concurrentSocialDraftUpdate.status()).toBe(200);
  await page.getByLabel("Texto do rascunho").fill(revisedSocialDraftContent);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Esse registro mudou em outra tela. A lista foi atualizada; saia desta edição e abra novamente para carregar os dados atuais.")).toBeVisible();
  const conflictSocialDraftsResponse = await request.get(`${E2E_API_BASE_URL}/api/social-drafts`, { headers: { Cookie: cookieHeader } });
  const conflictSocialDrafts = await conflictSocialDraftsResponse.json() as { items: Array<{ id: string; content: string }> };
  expect(conflictSocialDrafts.items.find((draft) => draft.id === savedSocialDraft!.id)?.content).toBe(concurrentSocialDraftContent);
  await page.getByRole("button", { name: `Abrir rascunho: ${socialDraftTopic}` }).click();
  await expect(page.getByLabel("Texto do rascunho")).toHaveValue(concurrentSocialDraftContent);
  await page.getByLabel("Texto do rascunho").fill(revisedSocialDraftContent);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Rascunho atualizado no escritório.")).toBeVisible();
  const revisedSocialDraftsResponse = await request.get(`${E2E_API_BASE_URL}/api/social-drafts`, { headers: { Cookie: cookieHeader } });
  const revisedSocialDrafts = await revisedSocialDraftsResponse.json() as { items: Array<{ id: string; platform: string; topic: string; content: string }> };
  expect(revisedSocialDrafts.items.find((draft) => draft.id === savedSocialDraft!.id)?.content).toBe(revisedSocialDraftContent);
  if (browserName !== "webkit") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiar texto para compartilhar" }).click();
  if (browserName !== "webkit") {
    await expect(page.getByText("Texto copiado. Abra a rede escolhida, confira o formato e cole manualmente.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${socialDraftTopic}\n\n${revisedSocialDraftContent}`);
  }

  await page.getByRole("button", { name: "Voltar ao escritório" }).click();
  await openTab(page, "Arquivos");
  await expect(page.getByTestId("documents-source-form")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Arquivos do escritório" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar documento", exact: true }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Escolher PDF do dispositivo" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "fixture-sintetico.pdf", mimeType: "application/pdf", buffer: documentBytes });
  await page.getByLabel("Nome do documento").fill(documentDisplayName);
  await page.getByRole("button", { name: "Fechar formulário de documento" }).click();
  await expect(page.getByTestId("documents-source-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar adição de documento" }).click();
  await expect(page.getByLabel("Nome do documento")).toHaveValue(documentDisplayName);
  await expect(page.getByLabel("Buscar processo para vincular ao documento")).toHaveCount(1);
  await page.getByLabel("Buscar processo para vincular ao documento").fill(revisedCaseLabel);
  await page.getByRole("button", { name: `Vincular: ${revisedCaseLabel} · 0000000-04.9999.8.16.0001` }).first().click();
  await page.getByRole("button", { name: "Guardar documento" }).click();
  const documentFileName = `${documentDisplayName}.pdf`;
  await expect(page.getByText("PDF enviado e protegido no cofre do escritório.")).toBeVisible();
  await expect(page.getByText(documentFileName).first()).toBeVisible();
  await expect(page.getByTestId("documents-source-form")).toHaveCount(0);

  const documentsResponse = await request.get(`${E2E_API_BASE_URL}/api/documents`, { headers: { Cookie: cookieHeader } });
  expect(documentsResponse.status()).toBe(200);
  const documents = await documentsResponse.json() as { items: Array<{ id: string; tenantId: string; fileName: string; caseId: string | null; byteSize: number; status: string; updatedAt: string }> };
  const savedDocument = documents.items.find((item) => item.fileName === documentFileName);
  expect(savedDocument).toMatchObject({ fileName: documentFileName, caseId: notedCase!.id, byteSize: documentBytes.byteLength, status: "ready" });

  const invalidPdfUpload = await request.post(`${E2E_API_BASE_URL}/api/documents`, {
    headers: { Cookie: cookieHeader },
    multipart: { file: { name: "pdf-invalido.pdf", mimeType: "application/pdf", buffer: Buffer.from("isto nao e um PDF", "utf8") } },
  });
  expect(invalidPdfUpload.status()).toBe(415);
  if (testInfo.project.name === "desktop-chromium") {
    const tooLargePdf = Buffer.alloc(10 * 1024 * 1024 + 1);
    tooLargePdf.write("%PDF-");
    const oversizedPdfUpload = await request.post(`${E2E_API_BASE_URL}/api/documents`, {
      headers: { Cookie: cookieHeader },
      multipart: { file: { name: "pdf-acima-do-limite.pdf", mimeType: "application/pdf", buffer: tooLargePdf } },
    });
    expect(oversizedPdfUpload.status()).toBe(413);
  }

  const downloadedDocumentResponse = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(downloadedDocumentResponse.status()).toBe(200);
  expect(downloadedDocumentResponse.headers()["content-type"]).toContain("application/pdf");
  expect(downloadedDocumentResponse.headers()["content-disposition"]).toContain("attachment");
  expect(downloadedDocumentResponse.headers()["content-security-policy"]).toBe("default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  expect(downloadedDocumentResponse.headers()["x-frame-options"]).toBe("DENY");
  expect(Buffer.from(await downloadedDocumentResponse.body()).equals(documentBytes)).toBe(true);
  if (testInfo.project.name === "desktop-chromium") {
    await verifyDocumentDownloadFailsClosed(savedDocument!.id, await apiCookieHeader(page));
  }

  const backupCopies = queryE2eD1(`SELECT backup_copy_id, backup_target, backup_object_key, ciphertext_sha256,
      ciphertext_byte_size, encryption_key_version
    FROM document_backup_copy_events
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'`);
  expect(backupCopies).toHaveLength(1);
  const backupCopy = backupCopies[0] as {
    backup_copy_id: string; backup_target: string; backup_object_key: string; ciphertext_sha256: string;
    ciphertext_byte_size: number; encryption_key_version: number;
  };
  expect(backupCopy).toMatchObject({ backup_target: "r2-documents-v1", encryption_key_version: 1 });
  expect(backupCopy.backup_object_key).toBe(`copies/${savedDocument!.tenantId}/${savedDocument!.id}/${backupCopy.backup_copy_id}.enc`);
  const backupCiphertext = readE2eR2Object("marcia-private-documents-backup-local", backupCopy.backup_object_key);
  expect(backupCiphertext.byteLength).toBe(backupCopy.ciphertext_byte_size);
  expect(createHash("sha256").update(backupCiphertext).digest("hex")).toBe(backupCopy.ciphertext_sha256);

  const primaryObjects = queryE2eD1(`SELECT object_key FROM documents
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'`);
  expect(primaryObjects).toHaveLength(1);
  const primaryObjectKey = String(primaryObjects[0]!.object_key);
  deleteE2eR2Object("marcia-private-documents-local", primaryObjectKey);
  const recoveredDocumentResponse = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(recoveredDocumentResponse.status()).toBe(200);
  expect(Buffer.from(await recoveredDocumentResponse.body()).equals(documentBytes)).toBe(true);
  const recoveryEvents = queryE2eD1(`SELECT primary_failure, primary_repaired, backup_copy_id
    FROM document_backup_recovery_events
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'`);
  expect(recoveryEvents).toEqual([{
    primary_failure: "primary_missing",
    primary_repaired: 1,
    backup_copy_id: backupCopy.backup_copy_id,
  }]);
  const repairedPrimary = readE2eR2Object("marcia-private-documents-local", primaryObjectKey);
  expect(createHash("sha256").update(repairedPrimary).digest("hex")).toBe(backupCopy.ciphertext_sha256);

  await replaceE2eR2Object("marcia-private-documents-local", primaryObjectKey, Buffer.from("ciphertext-sintetico-adulterado", "utf8"));
  const recoveredCorruptedDocument = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(recoveredCorruptedDocument.status()).toBe(200);
  expect(Buffer.from(await recoveredCorruptedDocument.body()).equals(documentBytes)).toBe(true);
  const corruptedRecovery = queryE2eD1(`SELECT primary_failure, primary_repaired
    FROM document_backup_recovery_events
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'
      AND primary_failure = 'primary_metadata_mismatch'`);
  expect(corruptedRecovery).toEqual([{ primary_failure: "primary_metadata_mismatch", primary_repaired: 1 }]);

  await page.getByRole("button", { name: `Assinar eletronicamente: ${documentFileName}` }).click();
  await expect(page.getByRole("heading", { name: "Assinatura eletrônica simples" })).toBeVisible();
  const missingConsent = await request.post(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
    data: { consentAccepted: false, consentVersion: "v2", confirmName: E2E_USER.name },
  });
  expect(missingConsent.status()).toBe(400);
  const wrongSignerName = await request.post(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
    data: { consentAccepted: true, consentVersion: "v2", confirmName: "Pessoa diferente" },
  });
  expect(wrongSignerName.status()).toBe(422);
  const legacyConsent = await request.post(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
    data: { consentAccepted: true, consentVersion: "v1", confirmName: E2E_USER.name },
  });
  expect(legacyConsent.status()).toBe(400);
  await page.getByLabel("Digite seu nome como aparece na conta do escritório").fill(E2E_USER.name);
  await page.getByRole("checkbox", { name: /Li a declaração e quero assinar esta versão do PDF eletronicamente/ }).click();
  await page.getByRole("button", { name: "Confirmar assinatura" }).click();
  await expect(page.getByText("Assinatura eletrônica registrada. O comprovante está vinculado ao hash do PDF.")).toBeVisible();
  const signingRecordsResponse = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
  });
  expect(signingRecordsResponse.status()).toBe(200);
  const signingRecords = await signingRecordsResponse.json() as { items: Array<{ documentSha256: string; confirmedName: string; consentVersion: string; consentText: string; canonicalPayload: string; receiptSha256: string }> };
  expect(signingRecords.items).toHaveLength(1);
  const signingReceipt = signingRecords.items[0]!;
  expect(signingReceipt.confirmedName).toBe(E2E_USER.name);
  expect(signingReceipt.consentVersion).toBe("v2");
  expect(signingReceipt.consentText).toContain("assinatura eletrônica simples");
  expect(signingReceipt.documentSha256).toBe(createHash("sha256").update(documentBytes).digest("hex"));
  expect(signingReceipt.receiptSha256).toBe(createHash("sha256").update(signingReceipt.canonicalPayload, "utf8").digest("hex"));
  const downloadedDocumentAfterSigning = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(downloadedDocumentAfterSigning.status()).toBe(200);
  expect(Buffer.from(await downloadedDocumentAfterSigning.body()).equals(documentBytes)).toBe(true);
  const duplicateSigning = await request.post(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
    data: { consentAccepted: true, consentVersion: "v2", confirmName: E2E_USER.name },
  });
  expect(duplicateSigning.status()).toBe(409);
  expect((await request.patch(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader }, data: { confirmedName: "Tentativa de edição" },
  })).status()).toBe(405);
  expect((await request.delete(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
  })).status()).toBe(405);
  const receiptDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: `Baixar / compartilhar comprovante: ${documentFileName}` }).click();
  const receiptDownload = await receiptDownloadPromise;
  const receiptFilePath = await receiptDownload.path();
  expect(receiptFilePath).not.toBeNull();
  const downloadedReceipt = JSON.parse(await readFile(receiptFilePath!, "utf8")) as { receipt: { canonicalPayload: string; receiptSha256: string } };
  expect(downloadedReceipt.receipt).toMatchObject({
    canonicalPayload: signingReceipt.canonicalPayload,
    receiptSha256: signingReceipt.receiptSha256,
  });

  const archiveDocumentResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/documents/${savedDocument!.id}/status`) && response.request().method() === "POST");
  await page.getByRole("button", { name: `Arquivar documento: ${documentFileName}` }).click();
  await page.getByRole("button", { name: "Confirmar arquivamento" }).click();
  const archiveDocumentResponse = await archiveDocumentResponsePromise;
  expect(archiveDocumentResponse.status()).toBe(200);
  expect(await archiveDocumentResponse.json()).toMatchObject({ status: "archived" });
  await expect(page.getByText("Documento arquivado. O histórico permanece acessível.")).toBeVisible();
  expect((await request.post(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
    data: { consentAccepted: true, consentVersion: "v2", confirmName: E2E_USER.name },
  })).status()).toBe(409);
  const archivedSigningRecords = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/signatures`, {
    headers: { Cookie: cookieHeader },
  });
  expect(archivedSigningRecords.status()).toBe(200);
  expect((await archivedSigningRecords.json() as { items: unknown[] }).items).toHaveLength(1);
  await page.getByRole("button", { name: "Mostrar documentos arquivados" }).click();
  await expect(page.getByText(documentFileName).first()).toBeVisible();
  const restoreDocumentResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/documents/${savedDocument!.id}/status`) && response.request().method() === "POST");
  await page.getByRole("button", { name: `Restaurar documento: ${documentFileName}` }).click();
  const restoreDocumentResponse = await restoreDocumentResponsePromise;
  expect(restoreDocumentResponse.status()).toBe(200);
  expect(await restoreDocumentResponse.json()).toMatchObject({ status: "ready" });
  await expect(page.getByText("Documento restaurado para a lista ativa.")).toBeVisible();

  await openTab(page, "Financeiro");
  await expect(page.getByTestId("finance-entry-form")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Valores previstos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lançamentos" })).toBeVisible();
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByTestId("finance-entry-form")).toBeVisible();
  await expect(page.getByLabel("Descrição do lançamento")).toBeFocused();
  await page.getByLabel("Descrição do lançamento").fill("Rascunho financeiro fictício");
  await page.getByRole("button", { name: "Fechar formulário de lançamento" }).click();
  await expect(page.getByTestId("finance-entry-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar lançamento" }).click();
  await expect(page.getByLabel("Descrição do lançamento")).toHaveValue("Rascunho financeiro fictício");
  await page.getByLabel("Descrição do lançamento").fill("");
  const readTotalCents = async (label: string) => Number((await page.getByLabel(label).innerText()).replace(/\D/g, ""));
  const initialIncomeCents = await readTotalCents("Total de receitas previstas");
  const initialExpenseCents = await readTotalCents("Total de despesas previstas");
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  await page.getByLabel("Descrição do lançamento").fill(expenseTitle);
  await page.getByLabel("Valor em reais e centavos").fill("125,50");
  await page.getByLabel("Categoria opcional do lançamento").fill(expenseCategory);
  const dueDates = await page.evaluate(() => {
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const offset = (days: number) => {
      const value = new Date();
      value.setDate(value.getDate() + days);
      return key(value);
    };
    const yesterday = offset(-1);
    const today = offset(0);
    const future = offset(14);
    return { yesterday: br(yesterday), today: br(today), future: br(future) };
  });
  await page.getByLabel("Data de vencimento opcional no formato DD/MM/AAAA").fill(dueDates.yesterday);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText(/Despesa\s+·\s+R\$\s*125,50/).first()).toBeVisible();
  await expect(page.getByText(/^Vencida em /).first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 12_550);

  await page.getByRole("button", { name: `Editar lançamento: ${expenseTitle}` }).click();
  await expect(page.getByLabel("Data de vencimento opcional no formato DD/MM/AAAA")).toHaveValue(dueDates.yesterday);
  await page.getByLabel("Descrição do lançamento").fill(revisedExpenseTitle);
  await page.getByLabel("Valor em reais e centavos").fill("130,00");
  await page.getByLabel("Categoria opcional do lançamento").fill(revisedExpenseCategory);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Alterações salvas.")).toBeVisible();
  await expect(page.getByText(revisedExpenseTitle).first()).toBeVisible();
  await expect(page.getByText(`Categoria: ${revisedExpenseCategory}`).first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 13_000);

  await page.getByRole("button", { name: `Editar lançamento: ${revisedExpenseTitle}` }).click();
  await page.getByLabel("Descrição do lançamento").fill(`${fixture} — edição local desatualizada`);
  const financialListResponse = await request.get(`${E2E_API_BASE_URL}/api/financial-entries`, { headers: { Cookie: cookieHeader } });
  expect(financialListResponse.status()).toBe(200);
  const financialList = await financialListResponse.json() as { items: Array<{ id: string; description: string; category: string | null; updatedAt: string }> };
  const currentExpense = financialList.items.find((item) => item.description === revisedExpenseTitle);
  expect(currentExpense).toBeDefined();
  expect(currentExpense?.category).toBe(revisedExpenseCategory);
  const concurrentUpdate = await request.patch(`${E2E_API_BASE_URL}/api/financial-entries/${currentExpense!.id}`, {
    headers: { Cookie: cookieHeader },
    data: { description: serverUpdatedExpenseTitle, amountCents: 14_000, expectedUpdatedAt: currentExpense!.updatedAt },
  });
  expect(concurrentUpdate.status()).toBe(200);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Esse registro mudou em outra tela. A lista foi atualizada; saia desta edição e abra novamente para carregar os dados atuais.")).toBeVisible();
  await expect(page.getByText(serverUpdatedExpenseTitle).first()).toBeVisible();
  await expect(page.getByText(`${fixture} — edição local desatualizada`)).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Esse registro mudou em outra tela. A lista foi atualizada; saia desta edição e abra novamente para carregar os dados atuais.")).toBeVisible();
  const afterStaleRetryResponse = await request.get(`${E2E_API_BASE_URL}/api/financial-entries`, { headers: { Cookie: cookieHeader } });
  expect(afterStaleRetryResponse.status()).toBe(200);
  const afterStaleRetry = await afterStaleRetryResponse.json() as { items: Array<{ description: string; amountCents: number }> };
  expect(afterStaleRetry.items.find((item) => item.description === serverUpdatedExpenseTitle)?.amountCents).toBe(14_000);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await expect(page.getByTestId("finance-entry-form")).toHaveCount(0);
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 14_000);

  const incomeTitle = `${fixture} — Honorários com vencimento hoje`;
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByRole("button", { name: "Receita selecionada", exact: true })).toBeVisible();
  await page.getByLabel("Descrição do lançamento").fill(incomeTitle);
  await page.getByLabel("Valor em reais e centavos").fill("300,00");
  await page.getByLabel("Data de vencimento opcional no formato DD/MM/AAAA").fill("31/02/2026");
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Informe uma data válida no formato DD/MM/AAAA ou deixe o vencimento em branco.")).toBeVisible();
  await page.getByLabel("Data de vencimento opcional no formato DD/MM/AAAA").fill(dueDates.today);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText("Vence hoje").first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de receitas previstas")).toBe(initialIncomeCents + 30_000);

  const maxAmountTitle = `${fixture} — valor máximo exato`;
  const maxAmountRow = page.getByTestId("financial-entry-row").filter({ hasText: maxAmountTitle });
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await page.getByLabel("Descrição do lançamento").fill(maxAmountTitle);
  await page.getByLabel("Valor em reais e centavos").fill("90071992547409,91");
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText(/Receita\s+·\s+R\$\s*90\.071\.992\.547\.409,91/).first()).toBeVisible();
  const maxFinancialListResponse = await request.get(`${E2E_API_BASE_URL}/api/financial-entries`, { headers: { Cookie: cookieHeader } });
  expect(maxFinancialListResponse.status()).toBe(200);
  const maxFinancialList = await maxFinancialListResponse.json() as { items: Array<{ id: string; description: string; amountCents: number; updatedAt: string }> };
  const maxFinancialEntry = maxFinancialList.items.find((item) => item.description === maxAmountTitle);
  expect(maxFinancialEntry?.amountCents).toBe(Number.MAX_SAFE_INTEGER);
  const exactIncomeTotalCents = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(initialIncomeCents + 30_000);
  const exactIncomeTotalWhole = exactIncomeTotalCents / 100n;
  const expectedIncomeTotal = `R$\u00a0${String(exactIncomeTotalWhole).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(exactIncomeTotalCents % 100n).padStart(2, "0")}`;
  await expect.poll(() => page.getByLabel("Total de receitas previstas").innerText())
    .toBe(expectedIncomeTotal);

  const rejectedAmounts = [0, 1.5, Number.MAX_SAFE_INTEGER + 1];
  for (const invalidAmountCents of rejectedAmounts) {
    const invalidAmountResponse = await request.post(`${E2E_API_BASE_URL}/api/financial-entries`, {
      headers: { Cookie: cookieHeader },
      data: { kind: "income", description: `${fixture} — valor rejeitado`, amountCents: invalidAmountCents },
    });
    expect(invalidAmountResponse.status()).toBe(400);
  }

  await page.getByRole("button", { name: `Editar lançamento: ${maxAmountTitle}` }).click();
  await expect(page.getByLabel("Valor em reais e centavos")).toHaveValue("90071992547409,91");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Alterações salvas.")).toBeVisible();
  const financialEntryBeforeAuditFailureResponse = await request.get(`${E2E_API_BASE_URL}/api/financial-entries`, { headers: { Cookie: cookieHeader } });
  expect(financialEntryBeforeAuditFailureResponse.status()).toBe(200);
  const financialEntriesBeforeAuditFailure = await financialEntryBeforeAuditFailureResponse.json() as {
    items: Array<{ id: string; description: string; status: string; updatedAt: string }>;
  };
  const entryBeforeAuditFailure = financialEntriesBeforeAuditFailure.items.find((item) => item.description === maxAmountTitle);
  expect(entryBeforeAuditFailure?.status).toBe("planned");
  expect(entryBeforeAuditFailure).toBeDefined();
  setFinancialAuditFailureTrigger(true);
  try {
    const failedAuditedTransition = await request.post(`${E2E_API_BASE_URL}/api/financial-entries/${entryBeforeAuditFailure!.id}/status`, {
      headers: { Cookie: cookieHeader },
      data: { status: "paid", expectedUpdatedAt: entryBeforeAuditFailure!.updatedAt },
    });
    expect(failedAuditedTransition.status()).toBe(500);
    const financialEntryAfterAuditFailureResponse = await request.get(`${E2E_API_BASE_URL}/api/financial-entries`, { headers: { Cookie: cookieHeader } });
    expect(financialEntryAfterAuditFailureResponse.status()).toBe(200);
    const financialEntriesAfterAuditFailure = await financialEntryAfterAuditFailureResponse.json() as {
      items: Array<{ id: string; status: string; updatedAt: string }>;
    };
    expect(financialEntriesAfterAuditFailure.items.find((item) => item.id === entryBeforeAuditFailure!.id))
      .toMatchObject({ status: "planned", updatedAt: entryBeforeAuditFailure!.updatedAt });
  } finally {
    setFinancialAuditFailureTrigger(false);
  }
  await page.getByRole("button", { name: `Cancelar lançamento: ${maxAmountTitle}` }).click();
  await expect(page.getByText("Cancelar este lançamento previsto? Ele permanecerá no histórico.")).toBeVisible();
  await page.getByRole("button", { name: `Manter lançamento: ${maxAmountTitle}` }).click();
  await expect(page.getByRole("button", { name: `Cancelar lançamento: ${maxAmountTitle}` })).toBeVisible();
  await page.getByRole("button", { name: `Cancelar lançamento: ${maxAmountTitle}` }).click();
  await page.getByRole("button", { name: `Confirmar cancelamento: ${maxAmountTitle}` }).click();
  await expect(maxAmountRow.getByText("Lançamento cancelado.", { exact: true })).toBeVisible();
  await expect.poll(() => readTotalCents("Total de receitas previstas")).toBe(initialIncomeCents + 30_000);

  const futureExpenseTitle = `${fixture} — Despesa futura`;
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  await page.getByLabel("Descrição do lançamento").fill(futureExpenseTitle);
  await page.getByLabel("Valor em reais e centavos").fill("50,00");
  await page.getByLabel("Data de vencimento opcional no formato DD/MM/AAAA").fill(dueDates.future);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText(/^Vence em /).first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 19_000);

  const paymentResponse = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith("/api/financial-entries/")
    && new URL(response.url()).pathname.endsWith("/status"));
  await page.getByRole("button", { name: `Marcar como pago: ${serverUpdatedExpenseTitle}` }).click();
  const paymentResult = await paymentResponse;
  expect(paymentResult.status(), `Resposta de atualização em ${paymentResult.url()}`).toBe(200);
  const serverUpdatedExpenseRow = page.getByTestId("financial-entry-row").filter({ hasText: serverUpdatedExpenseTitle });
  await expect(serverUpdatedExpenseRow.getByText("Lançamento atualizado.", { exact: true })).toBeVisible();
  await expect(page.getByText("Pago").first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 5_000);
  await page.getByRole("button", { name: `Cancelar lançamento: ${futureExpenseTitle}` }).click();
  await page.getByRole("button", { name: `Confirmar cancelamento: ${futureExpenseTitle}` }).click();
  const futureExpenseRow = page.getByTestId("financial-entry-row").filter({ hasText: futureExpenseTitle });
  await expect(futureExpenseRow.getByText("Lançamento cancelado.", { exact: true })).toBeVisible();
  await expect(page.getByText(futureExpenseTitle).first()).toBeVisible();
  await expect(page.getByLabel(`Status do lançamento ${futureExpenseTitle}: Cancelado`)).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents);
  await expect.poll(() => readTotalCents("Total de receitas previstas")).toBe(initialIncomeCents + 30_000);

  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Financeiro");
  await expect(page.getByText(serverUpdatedExpenseTitle).first()).toBeVisible();
  await expect(page.getByText(incomeTitle).first()).toBeVisible();
  await expect(page.getByText(futureExpenseTitle).first()).toBeVisible();
  await expect(page.getByLabel(`Status do lançamento ${futureExpenseTitle}: Cancelado`)).toBeVisible();
  await openTab(page, "Processos");
  await expect(page.getByText(revisedCaseLabel).first()).toBeVisible();
  await expect(page.getByText("Estado ou região: RS").first()).toBeVisible();
  await openTab(page, "Agenda");
  await expect(page.getByText(revisedAppointmentTitle).first()).toBeVisible();
  await expect(page.getByLabel(`Status do compromisso ${revisedAppointmentTitle}: Cancelado`)).toBeVisible();
  await selectAgendaView(page, "tasks");
  await expect(page.getByText(renamedTaskTitle).first()).toBeVisible();
  await selectAgendaView(page, "calendar");
  await selectAgendaDay(page, revisedTaskSchedule.iso);
  await expect(page.getByText(renamedTaskTitle, { exact: true }).first()).toBeVisible();
  await openTab(page, "Pesquisa");
  await expect(page.getByText(revisedResearchQuery, { exact: true }).first()).toBeVisible();
  await openTab(page, "Agenda");
  await selectAgendaDay(page, revisedTaskSchedule.iso);
  await expect(page.getByText(renamedTaskTitle, { exact: true }).first()).toBeVisible();
  await openTab(page, "Hoje");
  await page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" }).fill(serverUpdatedExpenseTitle);
  await page.getByRole("button", { name: `Abrir despesa: ${serverUpdatedExpenseTitle}` }).click();
  expectSearchTermNotInUrl(page, serverUpdatedExpenseTitle);
  await expect(page.getByText(`Resultados para “${serverUpdatedExpenseTitle}”. Os totais acima consideram todo o escritório.`)).toBeVisible();
  await expect(page.getByText(serverUpdatedExpenseTitle, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca do financeiro" }).click();
  await expect(page.getByText(serverUpdatedExpenseTitle).first()).toBeVisible();

  for (const { tab, id, primaryAnchor } of [
    { tab: "Hoje", id: "today", primaryAnchor: null },
    { tab: "Processos", id: "cases", primaryAnchor: "cases.new-process" },
    { tab: "Agenda", id: "agenda", primaryAnchor: "agenda.new-entry" },
    { tab: "Financeiro", id: "finance", primaryAnchor: "finance.new-entry" },
    { tab: "Pesquisa", id: "research", primaryAnchor: "research.open-source" },
    { tab: "Arquivos", id: "files", primaryAnchor: "files.add-document" },
  ]) {
    await openTab(page, tab);
    await expect(page.getByRole("tablist").getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
    if (tab === "Processos") {
      await page.getByTestId("process-collection-courtCases").click();
      await expect(page.getByTestId("process-collection-courtCases")).toHaveAttribute("aria-selected", "true");
    }
    if (tab === "Arquivos") {
      const closeDocumentForm = page.getByRole("button", { name: "Fechar formulário de documento", exact: true });
      if (await closeDocumentForm.isVisible().catch(() => false)) await closeDocumentForm.click();
    }
    if (primaryAnchor) {
      const button = page.getByTestId(`tour-anchor-${primaryAnchor}`).getByRole("button");
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS("background-color", "rgb(217, 151, 38)");
      await expect(button).toHaveCSS("border-color", "rgb(102, 71, 26)");
    }
    const primaryAction = primaryAnchor ? page.getByTestId(`tour-anchor-${primaryAnchor}`).getByRole("button") : undefined;
    await captureAtViewport(page, testInfo, `workspace-${id}-desktop`, 1440, 900, primaryAction);
    await captureAtViewport(page, testInfo, `workspace-${id}-mobile`, 375, 812, primaryAction);
  }

  await openTab(page, "Processos");
  for (const collection of [
    { id: "matters" as const, title: "Assuntos", action: "Novo assunto" },
    { id: "clients" as const, title: "Clientes", action: "Novo cliente" },
  ]) {
    await page.getByTestId(`process-collection-${collection.id}`).click();
    await expect(page.getByTestId(`process-collection-${collection.id}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: collection.title, exact: true })).toBeVisible();
    const action = page.getByRole("button", { name: collection.action, exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS("background-color", "rgb(217, 151, 38)");
    await expect(action).toHaveCSS("border-color", "rgb(102, 71, 26)");
    await captureAtViewport(page, testInfo, `workspace-${collection.id}-desktop`, 1440, 900, action);
    await captureAtViewport(page, testInfo, `workspace-${collection.id}-mobile`, 375, 812, action);
  }
  await page.getByTestId("process-collection-courtCases").click();

  await page.setViewportSize({ width: 1440, height: 900 });
  // Expo keeps visited tabs mounted in the web DOM; use the copy on the active screen.
  await (await activeTabElement(page.getByRole("button", { name: "Configurações de segurança da conta" }))).click();
  await expect(page.getByRole("heading", { name: "Segurança da conta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exportar dados do escritório" })).toBeVisible();
  const exportSessionResponse = await request.get(`${E2E_API_BASE_URL}/api/session`, { headers: { Cookie: cookieHeader } });
  expect(exportSessionResponse.status()).toBe(200);
  const exportSession = await exportSessionResponse.json() as { user: { id: string }; tenant: { id: string } };
  seedRateLimitBucket(exportSession.tenant.id, exportSession.user.id, "data-export", 3, 60 * 60);
  try {
    const blockedExport = await request.post(`${E2E_API_BASE_URL}/api/data-export`, {
      headers: { Cookie: cookieHeader },
      data: { acknowledgeSensitiveData: true, formatVersion: 1 },
    });
    expect(blockedExport.status()).toBe(429);
    expect(Number(blockedExport.headers()["retry-after"])).toBeGreaterThan(0);
  } finally {
    clearRateLimitBucket(exportSession.tenant.id, exportSession.user.id, "data-export");
  }
  await page.getByRole("button", { name: "Preparar exportação" }).click();
  const exportResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/data-export");
  const exportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar arquivo JSON" }).click();
  const [exportResponse, exportDownload] = await Promise.all([exportResponsePromise, exportDownloadPromise]);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()).toMatchObject({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "content-disposition": 'attachment; filename="marcia-office-export-v1.json"',
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  expect(exportDownload.suggestedFilename()).toMatch(/^marcia-escritorio-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const exportPath = await exportDownload.path();
  expect(exportPath).not.toBeNull();
  const exportJson = await readFile(exportPath!, "utf8");
  const exported = JSON.parse(exportJson) as {
    format: string;
    formatVersion: number;
    counts: { totalRows: number };
    collections: {
      clients: Array<{ display_name: string }>;
      documents: Array<Record<string, unknown>>;
      documentBackupRecoveryEvents: Array<Record<string, unknown>>;
      financialEntries: Array<{ description: string }>;
    };
    restore: string;
  };
  expect(exported).toMatchObject({ format: "marcia.office-data-export", formatVersion: 1 });
  expect(exportJson).not.toContain("fake-google-client-secret-e2e-only");
  expect(exportJson).not.toContain("fake-picker-key-e2e-only");
  expect(exported.counts.totalRows).toBeGreaterThan(0);
  expect(exported.collections.clients.some((client) => client.display_name === revisedClientName)).toBe(true);
  expect(exported.collections.documents.some((item) => item.file_name === documentFileName)).toBe(true);
  expect(exported.collections.documents[0]).not.toHaveProperty("object_key");
  expect(exported.collections.documents[0]).not.toHaveProperty("encryption_iv");
  expect(exported.collections.documentBackupRecoveryEvents.length).toBeGreaterThan(0);
  expect(exported.collections.documentBackupRecoveryEvents[0]).not.toHaveProperty("backup_object_key");
  expect(exported.collections.documentBackupRecoveryEvents[0]).not.toHaveProperty("ciphertext_sha256");
  expect(exported.collections.financialEntries.some((entry) => entry.description === serverUpdatedExpenseTitle)).toBe(true);
  expect(exported.restore).toContain("ainda não há rotina para restaurá-lo");
  await expect(page.getByText(/Arquivo exportado\./)).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao escritório" }).click();

  seedSyntheticOversizedExportNotes(exportSession.tenant.id, notedCase!.id, exportSession.user.id, 600);
  try {
    const oversizedExport = await request.post(`${E2E_API_BASE_URL}/api/data-export`, {
      headers: { Cookie: cookieHeader },
      data: { acknowledgeSensitiveData: true, formatVersion: 1 },
    });
    expect(oversizedExport.status()).toBe(413);
    expect(await oversizedExport.json()).toMatchObject({ error: "export_too_large" });
  } finally {
    clearSyntheticOversizedExportNotes(exportSession.tenant.id);
  }
  setSyntheticUserSessionAge(exportSession.user.id, "2000-01-01T00:00:00.000Z");
  const staleSessionExport = await request.post(`${E2E_API_BASE_URL}/api/data-export`, {
    headers: { Cookie: cookieHeader },
    data: { acknowledgeSensitiveData: true, formatVersion: 1 },
  });
  expect(staleSessionExport.status()).toBe(403);
  expect(await staleSessionExport.json()).toMatchObject({ error: "recent_login_required" });
  await signOutFromActiveTab(page);
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
  await signIn(page);
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  cookieHeader = await apiCookieHeader(page);

  deleteE2eR2Object("marcia-private-documents-local", primaryObjectKey);
  await replaceE2eR2Object(
    "marcia-private-documents-backup-local",
    backupCopy.backup_object_key,
    Buffer.from("copia-de-backup-sintetica-adulterada", "utf8"),
  );
  const corruptBackupDownload = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(corruptBackupDownload.status()).toBe(503);
  const corruptBackupError = await corruptBackupDownload.json() as { error: string };
  expect(corruptBackupError).toEqual({ error: "document_object_unavailable" });
  const corruptBackupAttempt = queryE2eD1(`SELECT primary_failure, backup_outcome, primary_repaired
    FROM document_backup_recovery_events
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'
      AND backup_outcome = 'backup_metadata_mismatch'`);
  expect(corruptBackupAttempt).toEqual([{
    primary_failure: "primary_missing",
    backup_outcome: "backup_metadata_mismatch",
    primary_repaired: 0,
  }]);

  deleteE2eR2Object("marcia-private-documents-backup-local", backupCopy.backup_object_key);
  const missingBackupDownload = await request.get(`${E2E_API_BASE_URL}/api/documents/${savedDocument!.id}/download`, {
    headers: { Cookie: cookieHeader },
  });
  expect(missingBackupDownload.status()).toBe(503);
  expect(await missingBackupDownload.json()).toEqual({ error: "document_object_unavailable" });
  const missingBackupAttempt = queryE2eD1(`SELECT primary_failure, backup_outcome, primary_repaired
    FROM document_backup_recovery_events
    WHERE tenant_id = '${savedDocument!.tenantId}' AND document_id = '${savedDocument!.id}'
      AND backup_outcome = 'backup_object_missing'`);
  expect(missingBackupAttempt).toEqual([{
    primary_failure: "primary_missing",
    backup_outcome: "backup_object_missing",
    primary_repaired: 0,
  }]);

  const additionalCourtLookups = [
    {
      courtName: "Tribunal de Justiça de Santa Catarina", jurisdiction: "SC", label: `${fixture} — TJSC lookup`,
      links: [
        { label: "Abrir consulta pública TJSC · 1º grau", url: "https://eprocwebcon.tjsc.jus.br/consulta1g/externo_controlador.php?acao=processo_consulta_publica" },
        { label: "Abrir consulta pública TJSC · 2º grau", url: "https://eprocwebcon.tjsc.jus.br/consulta2g/externo_controlador.php?acao=processo_consulta_publica" },
      ],
    },
    {
      courtName: "Tribunal de Justiça do Rio Grande do Sul", jurisdiction: "RS", label: `${fixture} — TJRS lookup`,
      links: [{ label: "Abrir consulta pública TJRS", url: "https://www.tjrs.jus.br/novo/processos-e-servicos/consultas-processuais/acompanhamento-processual/" }],
    },
    {
      courtName: "Tribunal Regional Federal da 4ª Região", jurisdiction: "TRF4", label: `${fixture} — TRF4 lookup`,
      links: [{ label: "Abrir consulta pública TRF4/JF4", url: "https://www.trf4.jus.br/trf4/controlador.php?acao=principal" }],
    },
  ];
  for (const courtCase of additionalCourtLookups) {
    const created = await request.post(`${E2E_API_BASE_URL}/api/court-cases`, {
      headers: { Cookie: cookieHeader },
      data: { matterId: null, courtName: courtCase.courtName, jurisdiction: courtCase.jurisdiction, caseNumber: null, label: courtCase.label },
    });
    expect(created.status()).toBe(201);
  }
  await page.reload();
  await expect(page.getByText("Escritório conectado").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Processos");
  const officialPortalIntercepts = ["https://eprocwebcon.tjsc.jus.br/**", "https://www.tjrs.jus.br/**", "https://www.trf4.jus.br/**"];
  for (const pattern of officialPortalIntercepts) {
    await page.context().route(pattern, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Portal oficial · fixture E2E</title>" }));
  }
  try {
    for (const courtCase of additionalCourtLookups) {
      for (const link of courtCase.links) {
        const lookupButton = page.getByRole("button", { name: `${link.label}: ${courtCase.label}` });
        await expect(lookupButton).toBeVisible();
        const popupPromise = page.waitForEvent("popup");
        await lookupButton.click();
        const popup = await popupPromise;
        await expect.poll(() => popup.url()).toBe(link.url);
        await popup.close();
      }
    }
    const tjrsLabel = additionalCourtLookups[1]!.label;
    await page.getByRole("button", { name: `Como receber alertas deste tribunal: ${tjrsLabel}` }).click();
    const tjrsAlertGuide = page.getByTestId("official-alerts-guide");
    await expect(tjrsAlertGuide.getByText(/TJRS Push é gratuito e envia por e-mail movimentações do dia anterior/)).toBeVisible();
    for (const tjrsLink of [
      { label: "Abrir TJRS Push (serviço de e-mail)", url: "https://www.tjrs.jus.br/proc/sistema_push/" },
      { label: "Ler FAQ oficial do TJRS Push", url: "https://www.tjrs.jus.br/proc/sistema_push/faq.php" },
    ]) {
      const tjrsPushPopup = page.waitForEvent("popup");
      await tjrsAlertGuide.getByRole("button", { name: tjrsLink.label }).click();
      const tjrsPushPage = await tjrsPushPopup;
      await expect.poll(() => tjrsPushPage.url()).toBe(tjrsLink.url);
      await tjrsPushPage.close();
    }
  } finally {
    for (const pattern of officialPortalIntercepts) await page.context().unroute(pattern);
  }

  await verifyTenantIsolation(page, request);
  await signOutFromActiveTab(page);
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
});

async function verifyTenantIsolation(page: Page, request: APIRequestContext) {
  const apiBase = `${E2E_API_BASE_URL}`;
  const ownerCookies = await page.context().cookies(apiBase);
  const ownerCookie = ownerCookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const ownerSessionResponse = await request.get(`${apiBase}/api/session`, { headers: { Cookie: ownerCookie } });
  expect(ownerSessionResponse.status()).toBe(200);
  const ownerSession = await ownerSessionResponse.json() as { user: { id: string }; tenant: { id: string } };
  const ownerScreenResponse = await request.get(`${apiBase}/api/onboarding/office-screens-v1`, { headers: { Cookie: ownerCookie } });
  expect(ownerScreenResponse.status()).toBe(200);
  const ownerScreenProgress = await ownerScreenResponse.json() as { seenScreenIds: string[] };

  const collectionPaths = [
    "/api/clients", "/api/matters", "/api/court-cases", "/api/tasks", "/api/appointments",
    "/api/financial-entries", "/api/legal-researches", "/api/social-drafts", "/api/documents",
  ];
  const ownerItems = new Map<string, Array<Record<string, unknown>>>();
  for (const path of collectionPaths) {
    const response = await request.get(`${apiBase}${path}`, { headers: { Cookie: ownerCookie } });
    expect(response.status(), `Escritório principal deveria ler ${path}`).toBe(200);
    const payload = await response.json() as { items: Array<Record<string, unknown>> };
    expect(payload.items.length, `Fixture do escritório principal para ${path}`).toBeGreaterThan(0);
    ownerItems.set(path, payload.items);
  }

  const ownerClient = ownerItems.get("/api/clients")![0]! as { id: string; updatedAt: string };
  const ownerMatter = ownerItems.get("/api/matters")![0]! as { id: string; title: string; updatedAt: string };
  const ownerCase = ownerItems.get("/api/court-cases")![0]! as { id: string; updatedAt: string };
  const ownerTask = ownerItems.get("/api/tasks")![0]! as { id: string; updatedAt: string };
  const ownerAppointment = ownerItems.get("/api/appointments")![0]! as { id: string; updatedAt: string };
  const ownerFinancialEntry = ownerItems.get("/api/financial-entries")![0]! as { id: string; updatedAt: string };
  const ownerResearch = ownerItems.get("/api/legal-researches")![0]! as { id: string; query: string; courtId: "TJPR" | "TJSC" | "TJRS" | "TRF4" | "STJ" | "STF"; updatedAt: string };
  const ownerSocialDraft = ownerItems.get("/api/social-drafts")![0]! as { id: string; platform: "instagram" | "facebook" | "tiktok"; topic: string; content: string; updatedAt: string };
  const ownerDocument = ownerItems.get("/api/documents")![0]! as { id: string };

  const importPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
  const ownerDocumentsBeforeLimit = ownerItems.get("/api/documents")!;
  seedRateLimitBucket(ownerSession.tenant.id, ownerSession.user.id, "document-import", 19, 60 * 60);
  const importAttempts = await Promise.all(["a", "b"].map((suffix) => request.post(`${apiBase}/api/documents`, {
    headers: { Cookie: ownerCookie },
    multipart: { file: { name: `recibo-cota-${suffix}.pdf`, mimeType: "application/pdf", buffer: importPdf } },
  })));
  expect(importAttempts.map((response) => response.status()).sort()).toEqual([201, 429]);
  const rateLimitedOwnerUpload = importAttempts.find((response) => response.status() === 429)!;
  expect(Number(rateLimitedOwnerUpload.headers()["retry-after"])).toBeGreaterThan(0);
  expect(await rateLimitedOwnerUpload.json()).toMatchObject({ error: "rate_limited" });
  const successfulOwnerUpload = importAttempts.find((response) => response.status() === 201)!;
  const createdOwnerDocument = (await successfulOwnerUpload.json() as { item: { id: string; updatedAt: string } }).item;
  const archiveOwnerUpload = await request.post(`${apiBase}/api/documents/${createdOwnerDocument.id}/status`, {
    headers: { Cookie: ownerCookie }, data: { status: "archived", expectedUpdatedAt: createdOwnerDocument.updatedAt },
  });
  expect(archiveOwnerUpload.status()).toBe(200);
  const ownerDocumentsAfterLimit = await request.get(`${apiBase}/api/documents`, { headers: { Cookie: ownerCookie } });
  expect(ownerDocumentsAfterLimit.status()).toBe(200);
  expect((await ownerDocumentsAfterLimit.json() as { items: unknown[] }).items).toHaveLength(ownerDocumentsBeforeLimit.length);
  clearRateLimitBucket(ownerSession.tenant.id, ownerSession.user.id, "document-import");

  await openTab(page, "Hoje");
  const ownerSearch = page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" });
  await ownerSearch.fill(ownerMatter.title);
  await signOutFromActiveTab(page);
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
  await signIn(page, isolationUser.email, isolationUser.password);
  await expect.poll(async () => {
    const currentCookies = await page.context().cookies(apiBase);
    const currentCookie = currentCookies.map(({ name, value }) => `${name}=${value}`).join("; ");
    return (await request.get(`${apiBase}/api/session`, { headers: { Cookie: currentCookie } })).status();
  }, { timeout: 15_000 }).toBe(200);
  await expect(page.getByRole("heading", { name: "Seu espaço" })).toBeVisible();
  await openTab(page, "Hoje");
  await expect(page.getByRole("textbox", { name: "Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros" })).toHaveValue("");

  const isolationCookies = await page.context().cookies(apiBase);
  const isolationCookie = isolationCookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const isolationSessionResponse = await request.get(`${apiBase}/api/session`, { headers: { Cookie: isolationCookie } });
  expect(isolationSessionResponse.status()).toBe(200);
  const isolationSession = await isolationSessionResponse.json() as { user: { id: string }; tenant: { id: string } };
  expect(isolationSession.tenant.id).not.toBe(ownerSession.tenant.id);
  setSyntheticTenantMembershipRole(isolationSession.tenant.id, isolationSession.user.id, "member");
  try {
    const memberExport = await request.post(`${apiBase}/api/data-export`, {
      headers: { Cookie: isolationCookie },
      data: { acknowledgeSensitiveData: true, formatVersion: 1 },
    });
    expect(memberExport.status()).toBe(403);
    expect(await memberExport.json()).toMatchObject({ error: "owner_required" });
  } finally {
    setSyntheticTenantMembershipRole(isolationSession.tenant.id, isolationSession.user.id, "owner");
    clearRateLimitBucket(isolationSession.tenant.id, isolationSession.user.id, "data-export");
  }
  try {
    const isolatedOfficeExport = await request.post(`${apiBase}/api/data-export`, {
      headers: { Cookie: isolationCookie },
      data: { acknowledgeSensitiveData: true, formatVersion: 1 },
    });
    expect(isolatedOfficeExport.status()).toBe(200);
    const isolatedPayload = await isolatedOfficeExport.json() as {
      collections: { clients: Array<{ display_name: string }>; matters: Array<{ title: string }> };
    };
    expect(isolatedPayload.collections.clients).toHaveLength(0);
    expect(isolatedPayload.collections.matters).toHaveLength(0);
    expect(JSON.stringify(isolatedPayload)).not.toContain("Cliente fictício");
  } finally {
    clearRateLimitBucket(isolationSession.tenant.id, isolationSession.user.id, "data-export");
  }
  let isolationProgress = await readGuidedTourProgress(page, request);
  if (isolationProgress.status === "not_started") {
    await expect.poll(async () => (await readGuidedTourProgress(page, request)).status, { timeout: 15_000 }).toBe("in_progress");
    isolationProgress = await readGuidedTourProgress(page, request);
  } else if (isolationProgress.status === "skipped" || isolationProgress.status === "completed") {
    await openTab(page, "Hoje");
    await reopenTourFromHelp(page);
    await expect(page.getByTestId("guided-tour-card").getByText("ETAPA 1 DE 6", { exact: true })).toBeVisible();
    isolationProgress = await readGuidedTourProgress(page, request);
  }
  expect(isolationProgress).toMatchObject({ tourId: "office_basics_v1", status: "in_progress", stepIndex: 0 });
  await expect(page.getByTestId("guided-tour-card").getByText("ETAPA 1 DE 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pular tour" }).click();
  await expect(page.getByTestId("guided-tour-card")).toHaveCount(0);

  const isolationScreensBeforeCases = await readGuidedTourScreens(page, request);
  await openTab(page, "Processos");
  if (isolationScreensBeforeCases.seenScreenIds.includes("cases")) {
    await expect(page.getByTestId("guided-screen-card")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("guided-screen-card")).toBeVisible();
    await expect(page.getByTestId("guided-screen-card").getByRole("heading", { name: "Processos" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar guia", exact: true }).click();
  }
  const isolatedMattersTab = page.getByTestId("process-collection-matters");
  await isolatedMattersTab.click();
  await expect(isolatedMattersTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Sem assuntos" })).toBeVisible();
  const isolatedCasesTab = page.getByTestId("process-collection-courtCases");
  await isolatedCasesTab.click();
  await expect(isolatedCasesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Sem processos" })).toBeVisible();
  let isolationScreenProgress = await readGuidedTourScreens(page, request);
  await expect.poll(async () => {
    isolationScreenProgress = await readGuidedTourScreens(page, request);
    return isolationScreenProgress.seenScreenIds;
  }).toEqual(expect.arrayContaining(["cases", "today"]));
  expect(isolationScreenProgress.seenScreenIds).toEqual(expect.arrayContaining(["cases", "today"]));
  expect(ownerScreenProgress.seenScreenIds).toContain("finance");
  if (!isolationScreensBeforeCases.seenScreenIds.includes("finance")) {
    expect(isolationScreenProgress.seenScreenIds).not.toContain("finance");
  }

  for (const path of collectionPaths) {
    const response = await request.get(`${apiBase}${path}`, { headers: { Cookie: isolationCookie } });
    expect(response.status(), `Segundo escritório deveria ler ${path}`).toBe(200);
    const payload = await response.json() as { items: Array<Record<string, unknown>> };
    expect(payload.items, `Dados de ${path} não podem atravessar tenants`).toHaveLength(0);
  }

  const foreignReads = [
    request.get(`${apiBase}/api/court-cases/${ownerCase.id}/notes`, { headers: { Cookie: isolationCookie } }),
    request.get(`${apiBase}/api/court-cases/${ownerCase.id}/publications`, { headers: { Cookie: isolationCookie } }),
    request.get(`${apiBase}/api/documents/${ownerDocument.id}/download`, { headers: { Cookie: isolationCookie } }),
    request.get(`${apiBase}/api/documents/${ownerDocument.id}/signatures`, { headers: { Cookie: isolationCookie } }),
  ];
  for (const foreignRead of await Promise.all(foreignReads)) expect(foreignRead.status()).toBe(404);

  const foreignWrites = [
    request.patch(`${apiBase}/api/clients/${ownerClient.id}`, {
      headers: { Cookie: isolationCookie }, data: { displayName: "Edição cruzada bloqueada", expectedUpdatedAt: ownerClient.updatedAt },
    }),
    request.patch(`${apiBase}/api/matters/${ownerMatter.id}`, {
      headers: { Cookie: isolationCookie }, data: { title: "Edição cruzada bloqueada", expectedUpdatedAt: ownerMatter.updatedAt },
    }),
    request.patch(`${apiBase}/api/court-cases/${ownerCase.id}`, {
      headers: { Cookie: isolationCookie }, data: { label: "Edição cruzada bloqueada", expectedUpdatedAt: ownerCase.updatedAt },
    }),
    request.patch(`${apiBase}/api/tasks/${ownerTask.id}`, {
      headers: { Cookie: isolationCookie }, data: { title: "Edição cruzada bloqueada", expectedUpdatedAt: ownerTask.updatedAt },
    }),
    request.patch(`${apiBase}/api/appointments/${ownerAppointment.id}`, {
      headers: { Cookie: isolationCookie }, data: { title: "Edição cruzada bloqueada", expectedUpdatedAt: ownerAppointment.updatedAt },
    }),
    request.patch(`${apiBase}/api/financial-entries/${ownerFinancialEntry.id}`, {
      headers: { Cookie: isolationCookie }, data: { description: "Edição cruzada bloqueada", expectedUpdatedAt: ownerFinancialEntry.updatedAt },
    }),
    request.patch(`${apiBase}/api/legal-researches/${ownerResearch.id}`, {
      headers: { Cookie: isolationCookie }, data: { query: ownerResearch.query, courtId: ownerResearch.courtId, expectedUpdatedAt: ownerResearch.updatedAt },
    }),
    request.post(`${apiBase}/api/legal-researches/${ownerResearch.id}/status`, {
      headers: { Cookie: isolationCookie }, data: { status: "archived", expectedUpdatedAt: ownerResearch.updatedAt },
    }),
    request.patch(`${apiBase}/api/social-drafts/${ownerSocialDraft.id}`, {
      headers: { Cookie: isolationCookie }, data: { platform: ownerSocialDraft.platform, topic: ownerSocialDraft.topic, content: ownerSocialDraft.content, expectedUpdatedAt: ownerSocialDraft.updatedAt },
    }),
    request.post(`${apiBase}/api/clients/${ownerClient.id}/status`, {
      headers: { Cookie: isolationCookie }, data: { status: "archived", expectedUpdatedAt: ownerClient.updatedAt },
    }),
    request.post(`${apiBase}/api/matters/${ownerMatter.id}/archive`, {
      headers: { Cookie: isolationCookie }, data: { expectedUpdatedAt: ownerMatter.updatedAt },
    }),
    request.post(`${apiBase}/api/court-cases/${ownerCase.id}/archive`, {
      headers: { Cookie: isolationCookie }, data: { expectedUpdatedAt: ownerCase.updatedAt },
    }),
    request.post(`${apiBase}/api/tasks/${ownerTask.id}/status`, {
      headers: { Cookie: isolationCookie }, data: { status: "done", expectedUpdatedAt: ownerTask.updatedAt },
    }),
    request.post(`${apiBase}/api/appointments/${ownerAppointment.id}/cancel`, {
      headers: { Cookie: isolationCookie }, data: { expectedUpdatedAt: ownerAppointment.updatedAt },
    }),
    request.post(`${apiBase}/api/financial-entries/${ownerFinancialEntry.id}/cancel`, {
      headers: { Cookie: isolationCookie }, data: { expectedUpdatedAt: ownerFinancialEntry.updatedAt },
    }),
    request.post(`${apiBase}/api/tasks`, {
      headers: { Cookie: isolationCookie }, data: { title: "Vínculo entre escritórios bloqueado", matterId: ownerMatter.id },
    }),
    request.post(`${apiBase}/api/court-cases/${ownerCase.id}/notes`, {
      headers: { Cookie: isolationCookie }, data: { body: "Nota cruzada bloqueada." },
    }),
  ];
  for (const foreignWrite of await Promise.all(foreignWrites)) expect(foreignWrite.status()).toBe(404);

  const forgedTenantResearch = await request.post(`${apiBase}/api/legal-researches`, {
    headers: { Cookie: isolationCookie }, data: { query: "Tentativa de consulta no tenant alheio", courtId: "TRF4", tenantId: ownerSession.tenant.id },
  });
  expect(forgedTenantResearch.status()).toBe(400);

  const isolationUpload = await request.post(`${apiBase}/api/documents`, {
    headers: { Cookie: isolationCookie },
    multipart: { file: { name: "importacao-outro-escritorio.pdf", mimeType: "application/pdf", buffer: importPdf } },
  });
  expect(isolationUpload.status(), "a cota de importação do tenant owner não deve bloquear outro escritório").toBe(201);
  const isolationDocument = (await isolationUpload.json() as { item: { id: string; updatedAt: string } }).item;
  const archiveIsolationUpload = await request.post(`${apiBase}/api/documents/${isolationDocument.id}/status`, {
    headers: { Cookie: isolationCookie }, data: { status: "archived", expectedUpdatedAt: isolationDocument.updatedAt },
  });
  expect(archiveIsolationUpload.status()).toBe(200);
  const isolationDocumentsAfterArchive = await request.get(`${apiBase}/api/documents`, { headers: { Cookie: isolationCookie } });
  expect(isolationDocumentsAfterArchive.status()).toBe(200);
  expect((await isolationDocumentsAfterArchive.json() as { items: unknown[] }).items).toHaveLength(0);
}
