# GitHub automation

- Leia `../AGENTS.md` e `../docs/plano/04_SEGURANCA_CI_TESTES_OPERACAO.md` antes de alterar pipelines.
- Workflows devem usar permissões mínimas, Node/pnpm/Java e ferramentas com versão explícita, lockfile congelado, `timeout-minutes`, concorrência por branch e artefatos com retenção curta.
- Fixe Actions de terceiros por SHA completo e registre a release em comentário; Dependabot atualiza pins semanalmente.
- CI usa exclusivamente D1 local e dados sintéticos; não configure segredos de produção, acesso a tribunal, IA, Drive, assinatura ou redes sociais nos jobs de PR.
- `ci.yml` valida site/API/web E2E; `native-e2e.yml` constrói Android/iOS e executa a mesma jornada Maestro completa nos dois simuladores. Só declarar a plataforma validada depois do respectivo job remoto passar.
- Faça upload somente relatórios e screenshots fabricados. Não envie logcat/trace que possa conter formulário, token ou corpo de request.
- Pages publica apenas o site público. Não adicione deploy do app ou API sem environment protegido e decisão explícita.
