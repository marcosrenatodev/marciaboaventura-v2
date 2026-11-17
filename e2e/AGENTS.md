# E2E tests

- Use only synthetic names/data and a disposable local D1 directory. Never include files from the legal ZIPs, real process numbers, tokens or client data.
- Test the rendered app and observable user journeys. An export/typecheck is not an E2E result.
- Keep web tests on Playwright; native Android/iOS flows belong in `.maestro/` and require actual emulators/simulators.
- Auth in E2E uses public test-only fallback constants, never production secrets. Do not upload traces if they contain non-synthetic user data.
- Update `docs/PLANO_EXECUCAO_MARCIA.md` and `docs/plano/04_SEGURANCA_CI_TESTES_OPERACAO.md` when platform coverage or a test gate changes.
