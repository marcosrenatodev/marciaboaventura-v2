# GitHub automation

- Leia `../AGENTS.md` e `../docs/plano/04_SEGURANCA_CI_TESTES_OPERACAO.md` antes de alterar pipelines.
- Workflows devem usar permissões mínimas, Node/pnpm/Java e ferramentas com versão explícita, lockfile congelado, `timeout-minutes`, concorrência por branch e artefatos com retenção curta.
- Fixe Actions de terceiros por SHA completo e registre a release em comentário; Dependabot atualiza pins semanalmente.
- CI usa exclusivamente D1 local e dados sintéticos; não configure segredos de produção, acesso a tribunal, IA, Drive, assinatura ou redes sociais nos jobs de PR.
- `ci.yml` valida site/API/web E2E em PR e oferece `workflow_dispatch` para manutenção/manual; não duplicar a suíte completa em push de merge para `main`. `native-e2e.yml` é manual (`workflow_dispatch`); o padrão seguro é Android isolado, e `all` precisa ser escolhido explicitamente para executar Android e iOS. Só declarar a plataforma validada depois do respectivo job remoto passar; prefira executar só a plataforma necessária durante diagnóstico.
- No job iOS, pré-aquecer o bundle JavaScript via Metro antes de abrir o app; se a jornada falhar, inspecionar screenshot/log sanitizados antes de um novo dispatch.
- Faça upload somente relatórios e screenshots fabricados. Não envie logcat/trace que possa conter formulário, token ou corpo de request.
- Pages publica apenas o site público. Não adicione deploy do app ou API sem environment protegido e decisão explícita.
