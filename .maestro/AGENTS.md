# Maestro E2E flows

- Leia `../AGENTS.md`, `../docs/PLANO_EXECUCAO_MARCIA.md` e `../apps/mobile/AGENTS.md` antes de alterar fluxos.
- Use somente dados sintéticos, e-mails `.test`, token efêmero e banco D1 local descartável. Nunca reproduza dados dos ZIPs privados.
- Os testes dirigem a interface renderizada; não chame APIs internas do app nem burle a autenticação.
- Mantenha os fluxos curtos, orientados às jornadas P0 e com rótulos acessíveis estáveis. Dismissal/keyboard deve ser explícito.
- Execute com `APP_ID` e `DEV_SERVER_URL` fornecidos por ambiente. O flow `android-workspace.yaml` deve cobrir setup, assunto, processo, tarefa e lançamento financeiro.
- Não grave screenshots, logcat ou relatórios de uma sessão com dados reais no repositório. Reports ficam em diretório efêmero ou artefato CI sanitizado.
- iOS usa o mesmo modelo de jornada em runner macOS, mas selectors e comportamento de teclado precisam ser verificados no simulador iOS antes de ativar o job como gate.
