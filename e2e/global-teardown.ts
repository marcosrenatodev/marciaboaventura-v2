import { rmSync } from "node:fs";
import { E2E_D1_DIR } from "./constants";

export default function globalTeardown() {
  if (process.env.MARCIA_E2E_KEEP_DB === "1") return;
  rmSync(E2E_D1_DIR, { recursive: true, force: true });
}
