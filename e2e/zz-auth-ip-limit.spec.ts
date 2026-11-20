import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_API_BASE_URL, E2E_WEB_BASE_URL } from "./constants";

test.use({ screenshot: "off", trace: "off", video: "off" });

async function requestReset(request: APIRequestContext, email: string, clientIp: string) {
  return request.post(`${E2E_API_BASE_URL}/api/auth/request-password-reset`, {
    headers: {
      Origin: E2E_WEB_BASE_URL,
      "CF-Connecting-IP": clientIp,
    },
    data: { email, redirectTo: `${E2E_WEB_BASE_URL}/reset-password` },
  });
}

test("limita pedidos por IP mesmo quando os endereços de e-mail mudam", async ({ request }) => {
  const clientIp = "203.0.113.41";
  for (const email of [
    "reset-ip-a@example.test",
    "reset-ip-b@example.test",
    "reset-ip-c@example.test",
  ]) {
    const response = await requestReset(request, email, clientIp);
    if (response.status() !== 200) throw new Error("An allowed synthetic reset request was unexpectedly rejected.");
    const body = await response.json() as { status?: unknown };
    if (body.status !== true) throw new Error("The synthetic reset endpoint did not return its generic success response.");
  }

  const limited = await requestReset(request, "reset-ip-d@example.test", clientIp);
  expect(limited.status()).toBe(429);
  const retryAfter = Number(limited.headers()["retry-after"]);
  expect(Number.isInteger(retryAfter) && retryAfter > 0).toBe(true);
});
