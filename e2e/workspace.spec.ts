import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_SETUP_TOKEN, E2E_USER } from "./constants";

let ownerCreatedDuringRun = false;

async function signIn(page: Page) {
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
  await page.getByLabel("Senha").last().fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function signInOrSetUp(page: Page) {
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

  if (ownerCreatedDuringRun) {
    await signIn(page);
  } else {
    await page.getByRole("button", { name: "Primeira configuração do escritório" }).click();
    await page.getByLabel("Seu nome").fill(E2E_USER.name);
    await page.getByRole("textbox", { name: "E-mail" }).fill(E2E_USER.email);
    await page.getByLabel("Senha").fill(E2E_USER.password);
    await page.getByLabel("Código de configuração").fill(E2E_SETUP_TOKEN);
    const setupResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/setup/owner");
    await page.getByRole("button", { name: "Criar conta responsável" }).click();
    const result = await setupResponse;
    if (result.status() === 409) {
      await page.getByRole("link", { name: "Voltar" }).click();
      await signIn(page);
    } else {
      expect(result.status()).toBe(200);
    }
    ownerCreatedDuringRun = true;
  }

  await expect(page.getByText("Escritório conectado · dados da API").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Seu espaço" })).toBeVisible();
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
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

async function captureAtViewport(page: Page, testInfo: TestInfo, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await expect(page.getByText("Escritório conectado · dados da API").first()).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await testInfo.attach(`${name}-${width}x${height}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("configura o escritório, registra processo, tarefa e financeiro e conserva os dados", async ({ page, request }, testInfo) => {
  await signInOrSetUp(page);
  const fixture = `E2E ${testInfo.project.name}`;
  const matterTitle = `${fixture} — Pasta de exemplo`;
  const taskTitle = `${fixture} — Próximo passo de trabalho`;
  const expenseTitle = `${fixture} — Despesa fictícia`;
  const appointmentTitle = `${fixture} — Reunião fictícia`;
  const researchQuery = "responsabilidade civil falha na prestação de serviço";

  const unauthorized = await request.get("http://127.0.0.1:8787/api/session");
  expect(unauthorized.status()).toBe(401);
  const publicSignup = await request.post("http://127.0.0.1:8787/api/auth/sign-up/email", {
    data: { name: "Conta bloqueada E2E", email: "cadastro-publico@example.test", password: E2E_USER.password },
  });
  expect([400, 401, 403]).toContain(publicSignup.status());

  await openTab(page, "Processos");
  await page.getByLabel("Nome do assunto").fill(matterTitle);
  await page.getByRole("button", { name: "Cadastrar assunto" }).click();
  await expect(page.getByRole("heading", { name: matterTitle })).toBeVisible();

  await page.getByLabel("Tribunal do processo").fill("Tribunal de Justiça do Paraná");
  await page.getByLabel("Estado ou região do processo").fill("PR");
  await page.getByLabel("Identificação curta, opcional").fill(`${fixture} — Caso fictício`);
  await page.getByRole("button", { name: `Selecionar assunto: ${matterTitle}` }).click();
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByText("Processo cadastrado pela API. Nenhum tribunal foi consultado.")).toBeVisible();
  await expect(page.getByText("Tribunal: Tribunal de Justiça do Paraná").first()).toBeVisible();

  const cookies = await page.context().cookies("http://127.0.0.1:8787");
  const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const forgedTenant = await request.post("http://127.0.0.1:8787/api/matters", {
    headers: { Cookie: cookieHeader },
    data: { title: "Tentativa inválida de tenant", tenantId: "tenant-forjado-e2e" },
  });
  expect(forgedTenant.status()).toBe(400);

  await openTab(page, "Agenda");
  await page.getByLabel("Título da tarefa").fill(taskTitle);
  await page.getByRole("button", { name: "Cadastrar tarefa" }).click();
  await expect(page.getByText(taskTitle).first()).toBeVisible();
  await expect(page.getByText(/não prazo judicial/i).first()).toBeVisible();

  await page.getByLabel("Título do compromisso").fill(appointmentTitle);
  await page.getByLabel("Data do compromisso (AAAA-MM-DD)").fill("2026-12-04");
  await page.getByLabel("Horário de início (HH:MM)").fill("14:00");
  await page.getByLabel("Horário de término (HH:MM)").fill("15:00");
  await page.getByRole("button", { name: "Cadastrar compromisso" }).click();
  await expect(page.getByText("Compromisso cadastrado no escritório.").first()).toBeVisible();
  await expect(page.getByText(appointmentTitle).first()).toBeVisible();

  await openTab(page, "Pesquisa");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Questão jurídica para pesquisar").fill(researchQuery);
  await page.getByRole("radio", { name: "TRF4 — Justiça Federal da 4ª Região" }).click();
  await page.getByRole("button", { name: "Copiar termos da busca" }).click();
  await expect(page.getByText(/Consulta copiada/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(researchQuery);
  const sourcePopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir pesquisa oficial TRF4" }).click();
  const sourcePage = await sourcePopup;
  await expect.poll(() => sourcePage.url()).toContain("trf4.jus.br");
  await sourcePage.close();
  await page.getByRole("button", { name: "Salvar busca no escritório" }).click();
  await expect(page.getByText("Busca salva no escritório. Os resultados precisam ser conferidos na fonte oficial.")).toBeVisible();
  await expect(page.getByText(researchQuery).first()).toBeVisible();

  await openTab(page, "Financeiro");
  const readTotalCents = async (label: string) => Number((await page.getByLabel(label).innerText()).replace(/\D/g, ""));
  const initialIncomeCents = await readTotalCents("Total de receitas previstas");
  const initialExpenseCents = await readTotalCents("Total de despesas previstas");
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  await page.getByLabel("Descrição do lançamento").fill(expenseTitle);
  await page.getByLabel("Valor em reais e centavos").fill("125,50");
  const dueDates = await page.evaluate(() => {
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const offset = (days: number) => {
      const value = new Date();
      value.setDate(value.getDate() + days);
      return key(value);
    };
    return { yesterday: offset(-1), today: offset(0), future: offset(14) };
  });
  await page.getByLabel("Data de vencimento opcional no formato AAAA-MM-DD").fill(dueDates.yesterday);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText("Despesa · R$ 125,50").first()).toBeVisible();
  await expect(page.getByText(/^Vencida em /).first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 12_550);

  const incomeTitle = `${fixture} — Honorários com vencimento hoje`;
  await page.getByRole("button", { name: "Receita", exact: true }).click();
  await page.getByLabel("Descrição do lançamento").fill(incomeTitle);
  await page.getByLabel("Valor em reais e centavos").fill("300,00");
  await page.getByLabel("Data de vencimento opcional no formato AAAA-MM-DD").fill(dueDates.today);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText("Vence hoje").first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de receitas previstas")).toBe(initialIncomeCents + 30_000);

  const futureExpenseTitle = `${fixture} — Despesa futura`;
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  await page.getByLabel("Descrição do lançamento").fill(futureExpenseTitle);
  await page.getByLabel("Valor em reais e centavos").fill("50,00");
  await page.getByLabel("Data de vencimento opcional no formato AAAA-MM-DD").fill(dueDates.future);
  await page.getByRole("button", { name: "Cadastrar lançamento" }).click();
  await expect(page.getByText("Lançamento confirmado pela API.")).toBeVisible();
  await expect(page.getByText(/^Vence em /).first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 17_550);

  const paymentResponse = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith("/api/financial-entries/")
    && new URL(response.url()).pathname.endsWith("/status"));
  await page.getByRole("button", { name: `Marcar como pago: ${expenseTitle}` }).click();
  const paymentResult = await paymentResponse;
  expect(paymentResult.status(), `Resposta de atualização em ${paymentResult.url()}`).toBe(200);
  await expect(page.getByText("Lançamento atualizado.")).toBeVisible();
  await expect(page.getByText("Pago").first()).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents + 5_000);
  await page.getByRole("button", { name: `Cancelar lançamento: ${futureExpenseTitle}` }).click();
  await expect(page.getByText("Lançamento cancelado.")).toBeVisible();
  await expect.poll(() => readTotalCents("Total de despesas previstas")).toBe(initialExpenseCents);
  await expect.poll(() => readTotalCents("Total de receitas previstas")).toBe(initialIncomeCents + 30_000);

  await page.reload();
  await expect(page.getByText("Escritório conectado · dados da API").first()).toBeVisible({ timeout: 15_000 });
  await openTab(page, "Financeiro");
  await expect(page.getByText(expenseTitle).first()).toBeVisible();
  await expect(page.getByText(incomeTitle).first()).toBeVisible();
  await expect(page.getByText(futureExpenseTitle)).toHaveCount(0);
  await openTab(page, "Processos");
  await expect(page.getByText("Tribunal de Justiça do Paraná").first()).toBeVisible();
  await openTab(page, "Agenda");
  await expect(page.getByText(taskTitle).first()).toBeVisible();
  await expect(page.getByText(appointmentTitle).first()).toBeVisible();
  await openTab(page, "Pesquisa");
  await expect(page.getByText(researchQuery).first()).toBeVisible();

  await captureAtViewport(page, testInfo, "workspace-desktop", 1440, 900);
  await captureAtViewport(page, testInfo, "workspace-tablet", 768, 1024);
  await captureAtViewport(page, testInfo, "workspace-mobile", 375, 812);

  await page.setViewportSize({ width: 1440, height: 900 });
  await signOutFromActiveTab(page);
  await expect(page.getByRole("heading", { name: "Bem-vinda" })).toBeVisible();
});
