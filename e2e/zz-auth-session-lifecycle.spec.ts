import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_D1_DIR, E2E_SETUP_TOKEN, E2E_USER, E2E_WEB_BASE_URL } from "./constants";

// Session cookies are credentials. Never collect browser artifacts.
test.use({ screenshot: "off", trace: "off", video: "off" });

async function ensureSyntheticOwner(request: APIRequestContext) {
  const response = await request.post(`${E2E_API_BASE_URL}/api/setup/owner`, {
    headers: { Origin: E2E_WEB_BASE_URL },
    data: {
      name: E2E_USER.name,
      email: E2E_USER.email,
      password: E2E_USER.password,
      setupToken: E2E_SETUP_TOKEN,
    },
  });
  if (response.status() !== 200 && response.status() !== 409) {
    throw new Error("Could not prepare the isolated synthetic owner account for the session journey.");
  }
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Bem-vinda" }).waitFor();
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
  await page.getByLabel("Senha", { exact: true }).fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function cookieHeader(page: Page) {
  const cookies = await page.context().cookies(E2E_API_BASE_URL);
  const value = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!value) throw new Error("The synthetic sign-in did not create an API session cookie.");
  return value;
}

function setSyntheticSessionExpiry(userId: string, expiresAt: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error("Expected a synthetic opaque user identifier.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt)) throw new Error("Expected a UTC synthetic session expiry.");
  const sql = `UPDATE session SET expiresAt = '${expiresAt}' WHERE userId = '${userId}';`;
  execFileSync("pnpm", [
    "exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", E2E_D1_DIR, "--command", sql,
  ], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

test("renova a sessão, encerra ao sair e exige login após a expiração", async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureSyntheticOwner(request);
  await signIn(page);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  const sessionResponse = await request.get(`${E2E_API_BASE_URL}/api/session`, {
    headers: { Cookie: await cookieHeader(page) },
  });
  expect(sessionResponse.status()).toBe(200);
  const sessionInfo = await sessionResponse.json() as { user: { id: string } };

  // 12-hour lifetime with a 3-hour refresh threshold: 8 hours remaining
  // should renew the database expiry to approximately 12 hours from now.
  setSyntheticSessionExpiry(sessionInfo.user.id, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString());
  await page.reload();
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  const refreshedResponse = await request.get(`${E2E_API_BASE_URL}/api/auth/get-session`, {
    headers: { Cookie: await cookieHeader(page) },
  });
  expect(refreshedResponse.status()).toBe(200);
  const refreshed = await refreshedResponse.json() as { session?: { expiresAt?: unknown }; user?: unknown };
  expect(refreshed.user).toBeTruthy();
  const refreshedExpiry = typeof refreshed.session?.expiresAt === "string" ? Date.parse(refreshed.session.expiresAt) : Number.NaN;
  expect(Number.isFinite(refreshedExpiry) && refreshedExpiry > Date.now() + 11 * 60 * 60 * 1000).toBe(true);

  const logoutCookie = await cookieHeader(page);
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
  const signedOutSession = await request.get(`${E2E_API_BASE_URL}/api/session`, {
    headers: { Cookie: logoutCookie },
  });
  expect(signedOutSession.status()).toBe(401);

  await signIn(page);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  const staleCookie = await cookieHeader(page);
  setSyntheticSessionExpiry(sessionInfo.user.id, new Date(Date.now() - 60_000).toISOString());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
  const expiredSessionResponse = await request.get(`${E2E_API_BASE_URL}/api/session`, {
    headers: { Cookie: staleCookie },
  });
  expect(expiredSessionResponse.status()).toBe(401);
});
