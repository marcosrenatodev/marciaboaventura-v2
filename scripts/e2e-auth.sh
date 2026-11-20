#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/marcia-e2e-auth.XXXXXX")"
trap 'rm -rf -- "$temp_root"' EXIT

export MARCIA_E2E_AUTH_ONLY=1
export MARCIA_E2E_AUTH_OUTPUT_DIR="${MARCIA_E2E_AUTH_OUTPUT_DIR:-${temp_root}/results}"
export MARCIA_E2E_D1_DIR="${temp_root}/d1"
export MARCIA_E2E_WEB_DIR="${MARCIA_E2E_WEB_DIR:-${temp_root}/web}"
# Common local usability sessions occupy 8082/8083. Use separate loopback-only
# defaults and allow a caller to choose another isolated port set without editing this script.
export MARCIA_E2E_API_BASE_URL="${MARCIA_E2E_API_BASE_URL:-http://127.0.0.1:8790}"
export MARCIA_E2E_OAUTH_BASE_URL="${MARCIA_E2E_OAUTH_BASE_URL:-http://127.0.0.1:8791}"
export MARCIA_E2E_WEB_BASE_URL="${MARCIA_E2E_WEB_BASE_URL:-http://127.0.0.1:18082}"
export MARCIA_E2E_SITE_BASE_URL="${MARCIA_E2E_SITE_BASE_URL:-http://127.0.0.1:13101}"

cd "${repo_root}"
pnpm e2e:web:build

run_auth_scenario() {
  local scenario="$1"
  local project="$2"
  export MARCIA_E2E_AUTH_SCENARIO="${scenario}"
  pnpm exec playwright test --project="${project}"
}

run_auth_scenario mfa desktop-chromium
run_auth_scenario mfa mobile-chromium
run_auth_scenario session-lifecycle desktop-chromium
run_auth_scenario session-lifecycle mobile-chromium
run_auth_scenario password-change desktop-chromium
run_auth_scenario password-change mobile-chromium
run_auth_scenario reset desktop-chromium
run_auth_scenario reset mobile-chromium
run_auth_scenario email-limit desktop-chromium
run_auth_scenario ip-limit desktop-chromium
