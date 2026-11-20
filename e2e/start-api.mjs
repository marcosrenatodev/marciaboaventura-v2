import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resetDisposableD1 } from "./disposable-d1.mjs";

const apiBaseUrl = process.env.MARCIA_E2E_API_BASE_URL ?? "http://127.0.0.1:8787";
const webOrigin = process.env.MARCIA_E2E_WEB_BASE_URL ?? "http://127.0.0.1:8081";
const oauthFixtureBaseUrl = process.env.MARCIA_E2E_OAUTH_BASE_URL ?? "http://127.0.0.1:8789";
const d1Dir = resolve(process.env.MARCIA_E2E_D1_DIR ?? join(tmpdir(), "marcia-e2e-d1"));
const authSecret = process.env.MARCIA_E2E_AUTH_SECRET ?? "marcia-e2e-auth-only-no-production-use-20261117";
const authFixtures = process.env.MARCIA_E2E_AUTH_FIXTURES === "1";
const authControlSecret = process.env.MARCIA_E2E_AUTH_CONTROL_SECRET ?? "";
const setupToken = process.env.MARCIA_E2E_SETUP_TOKEN ?? "marcia-local-e2e-setup-token-only-no-client-data-v1";
// Stable synthetic key for an isolated throwaway D1. Never reuse outside E2E.
const integrationKey = process.env.MARCIA_E2E_INTEGRATION_KEY ?? Buffer.alloc(32, 0x42).toString("base64");
// Stable synthetic key for the disposable local R2 vault. Never use with real documents.
const documentsKey = process.env.MARCIA_E2E_DOCUMENTS_KEY ?? Buffer.alloc(32, 0x24).toString("base64");
const djenFixtures = process.env.MARCIA_E2E_DJEN_FIXTURES === "1";
const oauthFixtures = process.env.MARCIA_E2E_OAUTH_FIXTURES === "1";
const serviceMode = process.env.MARCIA_E2E_SERVICE_MODE ?? "normal";
const skipMigrations = process.env.MARCIA_E2E_SKIP_MIGRATIONS === "1";
if (serviceMode !== "normal" && serviceMode !== "maintenance") throw new Error("MARCIA_E2E_SERVICE_MODE inválido");
const pdfFixture = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
const invalidPdfFixture = Buffer.from("<!doctype html>not a PDF", "utf8");
const oversizedProviderFixture = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
oversizedProviderFixture.write("%PDF-");
const projectDir = resolve("apps/api");
const maintenanceConfigPath = serviceMode === "maintenance"
  ? resolve(projectDir, `.wrangler-maintenance-e2e-${new URL(apiBaseUrl).port}.jsonc`)
  : undefined;
const environment = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  AUTH_BASE_URL: apiBaseUrl,
  AUTH_SECRET: authSecret,
  SETUP_OWNER_TOKEN: setupToken,
  INTEGRATION_CREDENTIALS_KEY: integrationKey,
  DOCUMENTS_ENCRYPTION_KEY: documentsKey,
  INTEGRATION_CREDENTIALS_ENABLED: "true",
  INTEGRATION_OAUTH_ENABLED: oauthFixtures ? "true" : "false",
  MARCIA_E2E_OAUTH_FIXTURES: oauthFixtures ? "1" : "0",
  DJEN_ENABLED: djenFixtures ? "true" : "false",
  DJEN_SCHEMA_VERIFIED: djenFixtures ? "true" : "false",
  DJEN_ENVIRONMENT: "homologation",
  DJEN_TEST_FIXTURES: djenFixtures ? "true" : "false",
  WEB_ORIGIN: webOrigin,
};

function createOAuthFixtureServer() {
  const usedCodes = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", oauthFixtureBaseUrl);
    const [, provider, endpoint] = url.pathname.split("/");
    const providerKey = provider === "google" ? "google_drive" : provider === "microsoft" ? "microsoft_graph" : null;
    const clientId = providerKey === "google_drive"
      ? "google-client-e2e.apps.example.test"
      : "microsoft-client-e2e-app";
    const clientSecret = providerKey === "google_drive"
      ? "fake-google-client-secret-e2e-only"
      : "fake-microsoft-client-secret-e2e-only";
    const scopes = providerKey === "google_drive"
      ? "openid email https://www.googleapis.com/auth/drive.file"
      : "offline_access User.Read Files.Read";
    const accessToken = providerKey === "google_drive" ? "synthetic-google-access-token" : "synthetic-microsoft-access-token";
    const refreshedAccessToken = providerKey === "google_drive" ? "synthetic-google-refreshed-access-token" : "synthetic-microsoft-refreshed-access-token";
    const refreshToken = providerKey === "google_drive" ? "synthetic-google-refresh-token" : "synthetic-microsoft-refresh-token";
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    const json = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(value));
    };
    const bytes = (status, value, contentType = "application/pdf", includeLength = true) => {
      response.writeHead(status, {
        "Content-Type": contentType,
        ...(includeLength ? { "Content-Length": String(value.length) } : {}),
      });
      response.end(value);
    };
    const badRequest = () => json(400, { error: "invalid_request" });

    if (!providerKey) return json(404, { error: "not_found" });

    const validProviderBearer = provider === "google"
      ? ["synthetic-google-access-token", "synthetic-google-refreshed-access-token"]
      : ["synthetic-microsoft-access-token", "synthetic-microsoft-refreshed-access-token"];
    if (request.method === "GET" && provider === "google" && /^\/google\/drive\/v3\/files\//.test(url.pathname)) {
      if (!validProviderBearer.some((token) => request.headers.authorization === `Bearer ${token}`)) return json(401, { error: "invalid_token" });
      const match = url.pathname.match(/^\/google\/drive\/v3\/files\/([^/]+)(?:\/(export))?$/);
      if (!match) return json(404, { error: "not_found" });
      const fileId = decodeURIComponent(match[1]);
      if (match[2] === "export") {
        return url.searchParams.get("mimeType") === "application/pdf"
          ? bytes(200, pdfFixture)
          : json(400, { error: "unsupported_export" });
      }
      if (url.searchParams.get("alt") === "media") {
        if (fileId === "synthetic-google-invalid-pdf") return bytes(200, invalidPdfFixture, "application/octet-stream");
        return bytes(200, pdfFixture);
      }
      const googleDoc = fileId === "synthetic-google-doc";
      return json(200, {
        id: fileId,
        name: googleDoc ? "Documento convertido do Google" : "Peça de demonstração Google",
        mimeType: googleDoc ? "application/vnd.google-apps.document" : "application/pdf",
        ...(fileId === "synthetic-google-large-pdf" ? { size: "10485761" } : { size: String(pdfFixture.length) }),
        trashed: fileId === "synthetic-google-trashed",
        capabilities: { canDownload: true },
      });
    }

    if (request.method === "GET" && provider === "microsoft" && url.pathname.startsWith("/microsoft/drive/v1.0/me/drive/")) {
      if (!validProviderBearer.some((token) => request.headers.authorization === `Bearer ${token}`)) return json(401, { error: "invalid_token" });
      const childrenMatch = url.pathname.match(/^\/microsoft\/drive\/v1\.0\/me\/drive\/(?:root\/children|items\/([^/]+)\/children)$/);
      if (childrenMatch) {
        const values = childrenMatch[1] === "synthetic-folder"
          ? [{ id: "synthetic-folder-pdf", name: "Anexo da pasta.pdf", file: { mimeType: "application/pdf" }, size: pdfFixture.length }]
          : url.searchParams.get("$skiptoken") === "fixture-page-2"
            ? [{ id: "synthetic-microsoft-second-pdf", name: "Segundo arquivo Microsoft.pdf", file: { mimeType: "application/pdf" }, size: pdfFixture.length }]
            : [
              { id: "synthetic-folder", name: "Pasta de demonstração", folder: { childCount: 1 } },
              { id: "synthetic-microsoft-pdf", name: "Peça de demonstração OneDrive.pdf", file: { mimeType: "application/pdf" }, size: pdfFixture.length },
              { id: "synthetic-microsoft-non-pdf", name: "Planilha.xlsx", file: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, size: 200 },
            ];
        const nextLink = !childrenMatch[1] && !url.searchParams.has("$skiptoken")
          ? `${url.origin}${url.pathname}?$skiptoken=fixture-page-2`
          : undefined;
        return json(200, { value: values, ...(nextLink ? { "@odata.nextLink": nextLink } : {}) });
      }
      const itemMatch = url.pathname.match(/^\/microsoft\/drive\/v1\.0\/me\/drive\/items\/([^/]+)(?:\/(content))?$/);
      if (!itemMatch) return json(404, { error: "not_found" });
      const fileId = decodeURIComponent(itemMatch[1]);
      if (itemMatch[2] === "content") {
        response.writeHead(302, { Location: fileId === "synthetic-microsoft-unsafe" ? "https://attacker.invalid/fixture.pdf" : `${url.origin}/microsoft/download/${encodeURIComponent(fileId)}` });
        return response.end();
      }
      return json(200, {
        id: fileId,
        name: fileId === "synthetic-microsoft-unsafe" ? "Arquivo inseguro.pdf" : "Peça de demonstração OneDrive.pdf",
        file: { mimeType: "application/pdf" },
        ...(fileId === "synthetic-microsoft-stream-large" ? {} : { size: pdfFixture.length }),
      });
    }

    if (request.method === "GET" && provider === "microsoft" && url.pathname.startsWith("/microsoft/download/")) {
      if (request.headers.authorization) return json(400, { error: "authorization_header_must_not_be_forwarded" });
      const fileId = decodeURIComponent(url.pathname.slice("/microsoft/download/".length));
      return fileId === "synthetic-microsoft-stream-large"
        ? bytes(200, oversizedProviderFixture, "application/pdf", false)
        : bytes(200, pdfFixture);
    }

    if (request.method === "POST" && endpoint === "token") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) return badRequest();
      }
      const fields = new URLSearchParams(body);
      if (fields.get("client_id") !== clientId || fields.get("client_secret") !== clientSecret) return badRequest();
      if (fields.get("grant_type") === "authorization_code") {
        const code = fields.get("code") ?? "";
        const [codeProvider, expectedChallenge, nonce] = code.split(".");
        const verifier = fields.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (codeProvider !== provider || !/^[A-Za-z0-9_-]{43}$/.test(expectedChallenge ?? "")
          || !/^[a-f0-9-]{36}$/i.test(nonce ?? "") || expectedChallenge !== challenge
          || fields.get("redirect_uri") !== `${apiBaseUrl}/api/integrations/${provider === "google" ? "google-drive" : "microsoft-graph"}/callback`
          || usedCodes.has(code)) return json(400, { error: "invalid_grant" });
        usedCodes.add(code);
        return json(200, { access_token: accessToken, refresh_token: refreshToken, expires_in: 60, scope: scopes, token_type: "Bearer" });
      } else if (fields.get("grant_type") === "refresh_token") {
        if (fields.get("refresh_token") !== refreshToken) return json(400, { error: "invalid_grant" });
        return json(200, { access_token: refreshedAccessToken, refresh_token: refreshToken, expires_in: 3600, scope: scopes, token_type: "Bearer" });
      } else {
        return badRequest();
      }
    }

    if (request.method === "GET" && (endpoint === "identity" || endpoint === "me")) {
      if (![accessToken, refreshedAccessToken].some((token) => request.headers.authorization === `Bearer ${token}`)) return json(401, { error: "invalid_token" });
      return providerKey === "google_drive"
        ? json(200, { sub: "synthetic-google-account-id", email: "google-e2e@example.test" })
        : json(200, { id: "synthetic-microsoft-account-id", mail: "microsoft-e2e@example.test", userPrincipalName: "microsoft-e2e@example.test", displayName: "Conta Microsoft E2E" });
    }

    if (request.method === "POST" && endpoint === "revoke" && providerKey === "google_drive") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) return badRequest();
      }
      if (new URLSearchParams(body).get("token") !== refreshToken) return badRequest();
      response.writeHead(200, { "Content-Length": "0" });
      return response.end();
    }

    return json(404, { error: "not_found" });
  });
  return server;
}

// Playwright starts webServer before globalSetup. Prepare D1 in this process
// before launching Wrangler so the worker never sees a half-initialized DB.
resetDisposableD1(d1Dir);
if (!skipMigrations) {
  const migration = spawnSync("pnpm", [
    "exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", d1Dir,
  ], { cwd: projectDir, env: environment, stdio: "inherit" });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) process.exit(migration.status ?? 1);
}

if (maintenanceConfigPath) {
  const baseConfig = readFileSync(resolve(projectDir, "wrangler.jsonc"), "utf8");
  const localOnlyConfig = baseConfig
    .replace('"name": "marcia-api-local-scaffold"', '"name": "marcia-api-maintenance-e2e"')
    .replace(/"SERVICE_MODE"\s*:\s*"normal"/u, '"SERVICE_MODE": "maintenance"');
  if (localOnlyConfig === baseConfig || localOnlyConfig.includes('"SERVICE_MODE": "normal"')
    || !localOnlyConfig.includes('"SERVICE_MODE": "maintenance"')) {
    throw new Error("Não foi possível preparar a configuração local de manutenção para E2E");
  }
  rmSync(maintenanceConfigPath, { force: true });
  writeFileSync(maintenanceConfigPath, localOnlyConfig, { mode: 0o600, flag: "wx" });
  chmodSync(maintenanceConfigPath, 0o600);
}

let oauthFixtureServer;
if (oauthFixtures) {
  oauthFixtureServer = createOAuthFixtureServer();
  await new Promise((resolveListen, rejectListen) => {
    oauthFixtureServer.once("error", rejectListen);
    oauthFixtureServer.listen(Number(new URL(oauthFixtureBaseUrl).port), new URL(oauthFixtureBaseUrl).hostname, resolveListen);
  });
}

if (environment.MARCIA_E2E_TENANT_ISOLATION === "1") {
  const isolationTenant = spawnSync(process.execPath, ["e2e/seed-isolation-tenant.mjs"], {
    cwd: resolve("."), env: environment, stdio: "inherit",
  });
  if (isolationTenant.error) throw isolationTenant.error;
  if (isolationTenant.status !== 0) process.exit(isolationTenant.status ?? 1);
}

const server = spawn("pnpm", [
  "exec", "wrangler", "dev", ...(maintenanceConfigPath ? ["--config", maintenanceConfigPath] : []),
  "--local", "--ip", "127.0.0.1", "--port", new URL(apiBaseUrl).port,
  "--persist-to", d1Dir,
  "--var", `AUTH_BASE_URL:${apiBaseUrl}`,
  "--var", `AUTH_SECRET:${authSecret}`,
  "--var", `WEB_ORIGIN:${webOrigin}`,
  "--var", `MARCIA_E2E_OAUTH_BASE_URL:${oauthFixtureBaseUrl}`,
  "--var", `SETUP_OWNER_TOKEN:${setupToken}`,
  "--var", `INTEGRATION_CREDENTIALS_KEY:${integrationKey}`,
  "--var", `DOCUMENTS_ENCRYPTION_KEY:${documentsKey}`,
  "--var", "DOCUMENT_BACKUP_ENABLED:true",
  "--var", "INTEGRATION_CREDENTIALS_ENABLED:true",
  "--var", `INTEGRATION_OAUTH_ENABLED:${oauthFixtures ? "true" : "false"}`,
  "--var", `MARCIA_E2E_OAUTH_FIXTURES:${oauthFixtures ? "1" : "0"}`,
  "--var", `DJEN_ENABLED:${djenFixtures ? "true" : "false"}`,
  "--var", `DJEN_SCHEMA_VERIFIED:${djenFixtures ? "true" : "false"}`,
  "--var", "DJEN_ENVIRONMENT:homologation",
  "--var", `DJEN_TEST_FIXTURES:${djenFixtures ? "true" : "false"}`,
  "--var", `MARCIA_E2E_AUTH_FIXTURES:${authFixtures ? "1" : "0"}`,
  ...(authFixtures ? ["--var", `MARCIA_E2E_AUTH_CONTROL_SECRET:${authControlSecret}`] : []),
], { cwd: projectDir, env: environment, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
    oauthFixtureServer?.close();
    if (maintenanceConfigPath) rmSync(maintenanceConfigPath, { force: true });
  });
}
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
server.on("exit", (code, signal) => {
  if (maintenanceConfigPath) rmSync(maintenanceConfigPath, { force: true });
  process.exitCode = code ?? (signal ? 1 : 0);
});
