import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const localBuildRoot = resolve(repoRoot, ".local");
const temporaryRoot = resolve(tmpdir());
const outputDirectory = resolve(process.env.MARCIA_E2E_WEB_DIR ?? join(localBuildRoot, "e2e-web-build"));
const localDefaultOutput = join(localBuildRoot, "e2e-web-build");
const relativeToTemporaryRoot = relative(temporaryRoot, outputDirectory);
const temporaryParent = relativeToTemporaryRoot.split(sep)[0] ?? "";
const outputIsUnderApprovedTemporaryRun = !relativeToTemporaryRoot.startsWith(`..${sep}`)
  && relativeToTemporaryRoot !== ".."
  && /^marcia-e2e-(web|auth)\..+$/.test(temporaryParent)
  && relativeToTemporaryRoot.split(sep).length > 1;
if (outputDirectory !== localDefaultOutput && !outputIsUnderApprovedTemporaryRun) {
  throw new Error("MARCIA_E2E_WEB_DIR precisa ser .local/e2e-web-build ou estar dentro de uma execução temporária E2E.");
}

const apiBaseUrl = (process.env.MARCIA_E2E_API_BASE_URL
  ?? process.env.MARCIA_E2E_API_URL
  ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const apiUrl = new URL(apiBaseUrl);
if (apiUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(apiUrl.hostname) || !apiUrl.port) {
  throw new Error("E2E web só aceita uma API HTTP local em loopback; nenhum endpoint externo será exportado.");
}

// Keep E2E builds away from apps/mobile/dist, which may be served by a user's
// local preview. The fixed-root check above makes clearing this directory safe.
rmSync(outputDirectory, { recursive: true, force: true });

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(packageManager, [
  "--filter", "@marcia/mobile", "exec", "expo", "export",
  "--platform", "web", "--output-dir", outputDirectory,
], {
  cwd: repoRoot,
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiBaseUrl },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

function containsApiUrl(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && containsApiUrl(path)) return true;
    if (entry.isFile() && entry.name.endsWith(".js") && readFileSync(path, "utf8").includes(apiBaseUrl)) return true;
  }
  return false;
}

if (!containsApiUrl(outputDirectory)) {
  rmSync(outputDirectory, { recursive: true, force: true });
  throw new Error(`O bundle E2E não contém a API isolada ${apiBaseUrl}; a exportação foi descartada para evitar chamadas a outro servidor.`);
}

console.log(`E2E web export isolado em ${outputDirectory}; API embutida ${apiBaseUrl}.`);
