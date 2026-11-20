import { removeDisposableD1 } from "./disposable-d1.mjs";
import { E2E_D1_DIR } from "./constants";

export default function globalTeardown() {
  if (process.env.MARCIA_E2E_KEEP_DB === "1") return;
  removeDisposableD1(E2E_D1_DIR);
}
