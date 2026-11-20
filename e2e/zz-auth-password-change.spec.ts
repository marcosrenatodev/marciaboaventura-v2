import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_SETUP_TOKEN, E2E_USER, E2E_WEB_BASE_URL } from "./constants";

// Passwords and session cookies are credentials. Never collect browser artifacts.
test.use({ screenshot: "off", trace: "off", video: "off" });

const changedPassword = "Senha-Trocada-E2E-Sintetica-2026!";

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
    throw new Error("Could not prepare the isolated synthetic owner account for the password-change journey.");
  }
}

async function signIn(page: Page, password: string) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Bem-vinda" }).waitFor();
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function cookieHeader(context: { cookies(url?: string | string[]): Promise<Array<{ name: string; value: string }>> }) {
  const cookies = await context.cookies(E2E_API_BASE_URL);
  const value = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!value) throw new Error("A synthetic sign-in did not create an API session cookie.");
  return value;
}

test("troca de senha mantém a sessão atual, encerra as demais e aceita a senha nova", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  await ensureSyntheticOwner(request);
  await signIn(page, E2E_USER.password);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  const currentCookie = await cookieHeader(page.context());

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await signIn(otherPage, E2E_USER.password);
    await expect(otherPage.getByTestId("workspace-session-bar")).toBeVisible();
    const otherCookie = await cookieHeader(otherContext);
    expect((await request.get(`${E2E_API_BASE_URL}/api/session`, { headers: { Cookie: currentCookie } })).status()).toBe(200);
    expect((await request.get(`${E2E_API_BASE_URL}/api/session`, { headers: { Cookie: otherCookie } })).status()).toBe(200);

    await page.goto("/seguranca");
    await expect(page.getByRole("heading", { name: "Segurança da conta" })).toBeVisible();
    await page.getByLabel("Senha atual para alteração", { exact: true }).fill(E2E_USER.password);
    await page.getByLabel("Nova senha", { exact: true }).fill(changedPassword);
    await page.getByLabel("Confirme a nova senha", { exact: true }).fill(changedPassword);
    await page.getByRole("button", { name: "Alterar senha e encerrar outras sessões" }).click();
    await expect(page.getByText("Senha alterada. As outras sessões foram encerradas.")).toBeVisible();

    const retainedSession = await request.get(`${E2E_API_BASE_URL}/api/session`, {
      headers: { Cookie: await cookieHeader(page.context()) },
    });
    expect(retainedSession.status()).toBe(200);
    const revokedSession = await request.get(`${E2E_API_BASE_URL}/api/session`, { headers: { Cookie: otherCookie } });
    expect(revokedSession.status()).toBe(401);

    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
    await signIn(page, E2E_USER.password);
    await expect(page.getByText("Não foi possível entrar. Confira o e-mail e a senha e tente novamente.")).toBeVisible();
    await signIn(page, changedPassword);
    await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  } finally {
    await otherContext.close();
  }
});
