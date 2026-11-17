# Maestro E2E flows

- Leia `../AGENTS.md`, `../docs/PLANO_EXECUCAO_MARCIA.md` e `../apps/mobile/AGENTS.md` antes de alterar fluxos.
- Use somente dados sintéticos, e-mails `.test`, token efêmero e banco D1 local descartável. Nunca reproduza dados dos ZIPs privados.
- Os testes dirigem a interface renderizada; não chame APIs internas do app nem burle a autenticação.
- Mantenha os fluxos curtos, orientados às jornadas P0 e com rótulos acessíveis estáveis. Dismissal/keyboard deve ser explícito.
- Execute com `APP_ID` fornecido por ambiente. O flow compartilhado `office-workspace.yaml` deve cobrir setup, assunto, processo, tarefa, compromisso, financeiro e pesquisa TRF4 em Android e iOS.
- Não grave screenshots, logcat ou relatórios de uma sessão com dados reais no repositório. Reports ficam em diretório efêmero ou artefato CI sanitizado.
- Android e iOS dirigem a mesma jornada em runner nativo. Selectors e comportamento de teclado precisam passar nos dois simuladores; screenshots e relatórios são artefatos temporários da CI.
