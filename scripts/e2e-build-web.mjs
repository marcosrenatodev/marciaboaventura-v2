import { spawnSync } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(packageManager, ["--filter", "@marcia/mobile", "export:web"], {
  env: {
    ...process.env,
    EXPO_PUBLIC_API_URL: process.env.MARCIA_E2E_API_URL ?? "http://127.0.0.1:8787",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
