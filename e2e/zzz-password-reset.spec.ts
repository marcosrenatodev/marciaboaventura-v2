import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  E2E_API_BASE_URL,
  E2E_AUTH_CONTROL_SECRET,
  E2E_SETUP_TOKEN,
  E2E_USER,
  E2E_WEB_BASE_URL,
} from "./constants";
import { freshTotp } from "./totp";

// Reset links are credentials. This journey must never produce browser artifacts.
test.use({ screenshot: "off", trace: "off", video: "off" });

const resetPassword = "E2E!Senha26?";
const shortPassword = "Curta!12345";
const tooLongPassword = `S${"x".repeat(128)}`;
const genericNotice = "Se este e-mail corresponder a uma conta do escritório, uma mensagem de redefinição será enviada. Confira sua caixa de entrada e o spam.";

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
    throw new Error("Could not prepare the isolated synthetic owner account for the password reset journey.");
  }
}

async function signIn(page: Page, password: string) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Bem-vinda" }).waitFor();
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
  await page.getByRole("textbox", { name: "Senha", exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function enableSyntheticMfa(page: Page, password: string) {
  await page.goto("/seguranca");
  await expect(page.getByRole("heading", { name: "Segurança da conta" })).toBeVisible();
  await page.getByLabel("Senha atual", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const secret = (await page.getByTestId("totp-enrollment-secret").textContent())?.trim() ?? "";
  if (!/^[A-Z2-7]{16,}$/.test(secret)) throw new Error("The account screen did not show a valid synthetic authenticator setup key.");
  await expect(page.getByTestId("two-factor-backup-code")).toHaveCount(10);
  await page.getByRole("checkbox", { name: "Confirmei que guardei os códigos de recuperação" }).click();
  await page.getByLabel("Código de seis dígitos do autenticador", { exact: true }).fill(await freshTotp(page, secret));
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(page.getByText("Proteção em duas etapas ativada para esta conta.")).toBeVisible();
  return secret;
}

async function requestResetFromScreen(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByRole("heading", { name: "Recuperar acesso" }).waitFor();
  await page.getByLabel("E-mail da conta").fill(email);
  const responsePromise = page.waitForResponse((response) => {
    try { return new URL(response.url()).pathname === "/api/auth/request-password-reset"; }
    catch { return false; }
  });
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  const response = await responsePromise;
  const body = await response.json() as { status?: unknown; message?: unknown };
  await expect(page.getByText(genericNotice)).toBeVisible();
  if (response.status() !== 200 || body.status !== true || typeof body.message !== "string") {
    throw new Error("The recovery request did not return the same generic confirmation.");
  }
  return body;
}

async function takeResetLink(request: APIRequestContext) {
  const url = `${E2E_API_BASE_URL}/__e2e/auth/reset-email`;
  const denied = await request.get(url, { headers: { "X-Ma-E2E-Control": "wrong-test-control-secret" } });
  if (denied.status() !== 404) throw new Error("The local synthetic mail fixture accepted an invalid control credential.");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request.get(url, { headers: { "X-Ma-E2E-Control": E2E_AUTH_CONTROL_SECRET } });
    if (response.status() === 425) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    if (response.status() !== 200) throw new Error("The local synthetic mail fixture could not return the reset link.");
    const body = await response.json() as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("The local synthetic mail fixture returned an invalid reset message.");
    try {
      const parsed = new URL(body.url);
      const callback = parsed.searchParams.get("callbackURL");
      const callbackUrl = callback ? new URL(callback) : null;
      const resetPathParts = parsed.pathname.split("/").filter(Boolean);
      const resetPathValid = (resetPathParts.length === 2 && resetPathParts[0] === "reset-password")
        || (resetPathParts.length === 4 && resetPathParts[0] === "api" && resetPathParts[1] === "auth" && resetPathParts[2] === "reset-password");
      if (parsed.origin !== E2E_API_BASE_URL || !resetPathValid
        || !/^[A-Za-z0-9_-]+$/.test(resetPathParts.at(-1) ?? "")
        || callbackUrl?.origin !== E2E_WEB_BASE_URL || callbackUrl.pathname !== "/reset-password") {
        throw new Error("unexpected destination");
      }
    } catch {
      throw new Error("The synthetic reset message did not point to the isolated local app.");
    }
    return body.url;
  }
  throw new Error("The synthetic reset message was not available in time.");
}

async function openResetLink(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch {
    // Do not let Playwright print a credential-bearing URL into terminal output.
    throw new Error("The local synthetic reset link did not open the app.");
  }
  await expect(page.getByRole("heading", { name: "Criar nova senha" })).toBeVisible();
}

test("email recovery stays generic, consumes one reset link, revokes the previous session, and preserves MFA", async ({ page, request }) => {
  await ensureSyntheticOwner(request);
  await signIn(page, E2E_USER.password);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  const authenticatorSecret = await enableSyntheticMfa(page, E2E_USER.password);
  const previousCookies = await page.context().cookies(E2E_API_BASE_URL);
  const previousCookieHeader = previousCookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!previousCookieHeader) throw new Error("The synthetic sign-in did not create a session cookie.");

  const unknownAccountResponse = await requestResetFromScreen(page, "nao-cadastrado@example.test");
  const knownAccountResponse = await requestResetFromScreen(page, E2E_USER.email);
  expect(knownAccountResponse).toEqual(unknownAccountResponse);

  const resetLink = await takeResetLink(request);
  await openResetLink(page, resetLink);

  for (const invalidPassword of [shortPassword, tooLongPassword]) {
    await page.getByLabel("Nova senha", { exact: true }).fill(invalidPassword);
    await page.getByLabel("Confirme a nova senha", { exact: true }).fill(invalidPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText("A nova senha precisa ter entre 12 e 128 caracteres.")).toBeVisible();
  }

  await page.getByLabel("Nova senha", { exact: true }).fill(resetPassword);
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill("Outra-senha-sintetica-2026!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText(/confirmação não corresponde/i)).toBeVisible();

  await page.getByLabel("Confirme a nova senha", { exact: true }).fill(resetPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Sua senha foi alterada e as sessões anteriores foram encerradas. Entre com a senha nova.")).toBeVisible();

  const staleSession = await request.get(`${E2E_API_BASE_URL}/api/session`, {
    headers: { Cookie: previousCookieHeader },
  });
  expect(staleSession.status()).toBe(401);

  await openResetLink(page, resetLink);
  await expect(page.getByText("Este link expirou, já foi usado ou está incompleto. Solicite outro link.")).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);

  const oldPasswordAttempt = await request.post(`${E2E_API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: E2E_WEB_BASE_URL },
    data: { email: E2E_USER.email, password: E2E_USER.password },
  });
  expect(oldPasswordAttempt.status()).toBe(401);

  await signIn(page, resetPassword);
  await expect(page.getByRole("heading", { name: "Confirmar acesso" })).toBeVisible();
  await page.getByLabel("Código do autenticador", { exact: true }).fill(await freshTotp(page, authenticatorSecret));
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  await requestResetFromScreen(page, E2E_USER.email);
  const expirePendingLink = await request.post(`${E2E_API_BASE_URL}/__e2e/auth/expire-reset-email`, {
    headers: { "X-Ma-E2E-Control": E2E_AUTH_CONTROL_SECRET },
  });
  if (expirePendingLink.status() !== 200) throw new Error("The local fixture could not expire the synthetic reset link.");
  const expiredLink = await takeResetLink(request);
  await openResetLink(page, expiredLink);
  await expect(page.getByText("Este link expirou, já foi usado ou está incompleto. Solicite outro link.")).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);

  await page.goto("/reset-password?token=invalid-synthetic-reset-token");
  await expect(page.getByRole("heading", { name: "Criar nova senha" })).toBeVisible();
  await page.getByLabel("Nova senha", { exact: true }).fill("Tentativa-invalida-E2E-2026!");
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill("Tentativa-invalida-E2E-2026!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("Este link expirou ou já foi usado. Solicite outro link de redefinição.")).toBeVisible();
});
