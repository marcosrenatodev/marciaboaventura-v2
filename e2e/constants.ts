import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const E2E_API_BASE_URL = "http://127.0.0.1:8787";
export const E2E_WEB_BASE_URL = "http://127.0.0.1:8081";
export const E2E_D1_DIR = resolve(process.env.MARCIA_E2E_D1_DIR ?? join(tmpdir(), "marcia-e2e-d1"));

// These are public synthetic fixture values for a disposable local D1 database.
export const E2E_SETUP_TOKEN = process.env.MARCIA_E2E_SETUP_TOKEN
  ?? "marcia-local-e2e-setup-token-only-no-client-data-v1";
export const E2E_AUTH_SECRET = process.env.MARCIA_E2E_AUTH_SECRET
  ?? "marcia-e2e-auth-only-no-production-use-20261117";
export const E2E_USER = {
  name: "Márcia E2E Fictícia",
  email: "marcia-e2e@example.test",
  password: "SomenteE2ETeste-SemSegredo-2026-!",
};
