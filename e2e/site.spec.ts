import { expect, test } from "@playwright/test";

test("preserva o site público e renderiza a demonstração sem dados reais", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dra. Marcia Boaventura" })).toBeVisible();
  await testInfo.attach("site-publico-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.goto("/escritorio");
  await expect(page.getByRole("heading", { name: "Bom dia, Márcia" })).toBeVisible();
  await expect(page.getByText("Demonstração com dados fictícios").first()).toBeVisible();
  await testInfo.attach("demonstracao-escritorio-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("heading", { name: "Bom dia, Márcia" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await testInfo.attach("demonstracao-escritorio-mobile-375", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
