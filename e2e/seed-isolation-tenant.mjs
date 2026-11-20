import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const rootDir = resolve(".");
const apiDir = resolve(rootDir, "apps/api");
const d1Dir = resolve(process.env.MARCIA_E2E_D1_DIR ?? "/tmp/marcia-e2e-d1");
const isolationUser = JSON.parse(readFileSync(new URL("./isolation-user.json", import.meta.url), "utf8"));
const apiRequire = createRequire(resolve(apiDir, "package.json"));
const { hashPassword } = apiRequire("better-auth/crypto");

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const now = new Date().toISOString();
const tenantId = crypto.randomUUID();
const userId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const passwordHash = await hashPassword(isolationUser.password);
const command = [
  `INSERT INTO organizations (tenant_id) VALUES (${sqlText(tenantId)})`,
  `INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES (${sqlText(userId)}, ${sqlText(isolationUser.name)}, ${sqlText(isolationUser.email)}, 0, NULL, ${sqlText(now)}, ${sqlText(now)})`,
  `INSERT INTO account (id, accountId, providerId, userId, accessToken, refreshToken, idToken,
    accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt)
    VALUES (${sqlText(accountId)}, ${sqlText(userId)}, 'credential', ${sqlText(userId)}, NULL, NULL, NULL,
    NULL, NULL, NULL, ${sqlText(passwordHash)}, ${sqlText(now)}, ${sqlText(now)})`,
  `INSERT INTO tenant_memberships (tenant_id, user_id, role)
    VALUES (${sqlText(tenantId)}, ${sqlText(userId)}, 'owner')`,
].join(";\n") + ";";

const seeded = spawnSync("pnpm", [
  "exec", "wrangler", "d1", "execute", "DB", "--local", "--command", command, "--persist-to", d1Dir,
], { cwd: apiDir, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: "inherit" });
if (seeded.error) throw seeded.error;
if (seeded.status !== 0) process.exit(seeded.status ?? 1);
