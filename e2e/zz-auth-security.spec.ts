import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_SETUP_TOKEN, E2E_USER, E2E_WEB_BASE_URL } from "./constants";
import { freshTotp } from "./totp";

// TOTP seeds and recovery codes are credentials. Never collect screenshots,
// videos, or traces from this flow, including on failure.
test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

async function signIn(page: Page, password = E2E_USER.password) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Bem-vinda" }).waitFor();
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
  await page.getByRole("textbox", { name: "Senha", exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

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
    throw new Error("Could not prepare the isolated synthetic owner account for the MFA journey.");
  }
}

async function openSecuritySettings(page: Page) {
  await page.goto("/seguranca");
  await expect(page.getByRole("heading", { name: "Segurança da conta" })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
}

async function fillSensitive(field: Locator, value: string, label: string) {
  try {
    await field.fill(value);
  } catch {
    throw new Error(`Could not enter the ${label} in the account flow.`);
  }
}

async function codesOnScreen(page: Page): Promise<string[]> {
  const visibleCodes = page.getByTestId("two-factor-backup-code");
  await expect(visibleCodes).toHaveCount(10);
  const values = await visibleCodes.allTextContents();
  if (values.length !== 10 || values.some((value) => !value.trim())) {
    throw new Error("The account screen did not show the expected recovery-code set.");
  }
  return values.map((value) => value.trim());
}

async function useBackupCodeAtLogin(page: Page, code: string) {
  await expect(page.getByRole("heading", { name: "Confirmar acesso" })).toBeVisible();
  const field = page.getByRole("textbox", { name: "Código de recuperação" });
  if (!(await field.count())) {
    await page.getByRole("button", { name: "Usar código de recuperação" }).click();
  }
  await fillSensitive(field, code, "recovery code");
  await page.getByRole("button", { name: "Confirmar código" }).click();
}

test("configura e protege a conta com TOTP e códigos de recuperação", async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureSyntheticOwner(request);
  await signIn(page);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  await openSecuritySettings(page);

  // Make this journey repeatable if an earlier run was interrupted while the
  // synthetic account was still logged in with MFA enabled.
  if (await page.getByText(/Ativa: além da senha/).count()) {
    await page.getByLabel("Senha atual").first().fill(E2E_USER.password);
    await page.getByRole("button", { name: "Desativar proteção em duas etapas" }).click();
    await expect(page.getByText("Proteção em duas etapas desativada.")).toBeVisible();
  }

  await page.getByLabel("Senha atual").first().fill(E2E_USER.password);
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const secret = (await page.getByTestId("totp-enrollment-secret").textContent())?.trim() ?? "";
  if (!/^[A-Z2-7]{16,}$/.test(secret)) throw new Error("The account screen did not show a valid authenticator setup key.");
  const originalCodes = await codesOnScreen(page);
  await page.getByRole("checkbox", { name: "Confirmei que guardei os códigos de recuperação" }).click();

  const activationCode = await freshTotp(page, secret);
  const invalidActivationCode = String((Number(activationCode) + 1) % 1_000_000).padStart(6, "0");
  await fillSensitive(page.getByLabel("Código de seis dígitos do autenticador"), invalidActivationCode, "authenticator code");
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(page.getByText(/O código não foi aceito/)).toBeVisible();
  await fillSensitive(page.getByLabel("Código de seis dígitos do autenticador"), await freshTotp(page, secret), "authenticator code");
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(page.getByText("Proteção em duas etapas ativada para esta conta.")).toBeVisible();

  await logout(page);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Confirmar acesso" })).toBeVisible();
  const loginCode = await freshTotp(page, secret);
  await fillSensitive(page.getByLabel("Código do autenticador"), String((Number(loginCode) + 1) % 1_000_000).padStart(6, "0"), "authenticator code");
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByText(/Código não aceito/)).toBeVisible();
  await fillSensitive(page.getByLabel("Código do autenticador"), await freshTotp(page, secret), "authenticator code");
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  await logout(page);
  await signIn(page);
  await useBackupCodeAtLogin(page, originalCodes[0]!);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  await openSecuritySettings(page);
  await page.getByLabel("Senha atual").first().fill(E2E_USER.password);
  await page.getByRole("button", { name: "Gerar novos códigos de recuperação" }).click();
  const regeneratedCodes = await codesOnScreen(page);
  if (new Set(regeneratedCodes).size !== 10 || regeneratedCodes.some((code) => originalCodes.includes(code))) {
    throw new Error("Recovery-code regeneration did not replace the previous code set.");
  }
  await page.getByRole("button", { name: "Já guardei os novos códigos" }).click();

  await logout(page);
  await signIn(page);
  await useBackupCodeAtLogin(page, originalCodes[1]!);
  await expect(page.getByText(/códigos de recuperação só podem ser usados uma vez/)).toBeVisible();
  await useBackupCodeAtLogin(page, originalCodes[0]!);
  await expect(page.getByText(/códigos de recuperação só podem ser usados uma vez/)).toBeVisible();
  await page.getByRole("button", { name: "Usar código do autenticador" }).click();
  await fillSensitive(page.getByLabel("Código do autenticador"), await freshTotp(page, secret), "authenticator code");
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();

  await openSecuritySettings(page);
  await page.getByLabel("Senha atual").first().fill(E2E_USER.password);
  await page.getByRole("button", { name: "Desativar proteção em duas etapas" }).click();
  await expect(page.getByText("Proteção em duas etapas desativada.")).toBeVisible();
  await logout(page);
  await signIn(page);
  await expect(page.getByTestId("workspace-session-bar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirmar acesso" })).toHaveCount(0);
});
