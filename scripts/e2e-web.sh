#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_root=""

if [[ -z "${MARCIA_E2E_D1_DIR:-}" ]]; then
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/marcia-e2e-web.XXXXXX")"
  export MARCIA_E2E_D1_DIR="${temp_root}/d1"
fi
if [[ -n "${temp_root}" ]]; then
  marcia_e2e_default_web_dir="${temp_root}/web"
else
  marcia_e2e_default_web_dir="${repo_root}/.local/e2e-web-build"
fi
export MARCIA_E2E_WEB_DIR="${MARCIA_E2E_WEB_DIR:-${marcia_e2e_default_web_dir}}"

cleanup() {
  if [[ -z "${temp_root}" ]]; then
    return
  fi

  if [[ "${MARCIA_E2E_KEEP_DB:-0}" == "1" ]]; then
    printf 'D1 E2E preservado em %s\n' "${MARCIA_E2E_D1_DIR}"
    return
  fi

  rm -rf -- "${temp_root}"
}

trap cleanup EXIT
cd "${repo_root}"
pnpm e2e:web
