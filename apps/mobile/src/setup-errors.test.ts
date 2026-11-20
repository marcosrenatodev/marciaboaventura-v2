import { describe, expect, it } from "vitest";
import { setupFailureMessage, setupTransportFailureMessage } from "./setup-errors";

describe("setup failure messages", () => {
  it("distinguishes invalid payloads from account creation failures", () => {
    expect(setupFailureMessage(400, "invalid_setup_request", null, false))
      .toContain("senha precisa ter de 12 a 128 caracteres");
    expect(setupFailureMessage(400, "owner_creation_failed", null, false))
      .toContain("use o mesmo e-mail");
  });

  it("gives actionable recovery after an interrupted or incomplete setup", () => {
    expect(setupFailureMessage(503, "setup_unavailable_retry_same_email", "5", false))
      .toContain("tente novamente com este mesmo e-mail");
    expect(setupFailureMessage(503, "setup_completion_failed_retry_same_email", null, false))
      .toContain("não use outro");
    expect(setupFailureMessage(409, "setup_unavailable", null, false))
      .toContain("tente entrar com o mesmo e-mail");
  });

  it("shows the API retry window without discarding form data", () => {
    expect(setupFailureMessage(429, "rate_limited", "61", false))
      .toContain("Aguarde 2 minutos");
    expect(setupFailureMessage(503, "rate_limit_unavailable", "5", false))
      .toContain("Aguarde 5 segundos");
    expect(setupFailureMessage(429, "rate_limited", "Wed, 21 Oct 2015 07:28:00 GMT", false))
      .toContain("Aguarde um pouco");
  });

  it("keeps maintenance and network failures distinct", () => {
    expect(setupFailureMessage(503, "setup_unavailable_retry_same_email", null, true))
      .toContain("em manutenção temporária");
    expect(setupTransportFailureMessage(false))
      .toContain("Não foi possível confirmar se a configuração terminou");
    expect(setupTransportFailureMessage(true))
      .toContain("em manutenção temporária");
  });
});
