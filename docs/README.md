# Documentação do projeto

## Comece por aqui

1. [Ponto rápido de retomada para IA e pessoas](ai/CURRENT_STATE.md)
2. [Plano mestre e execução detalhada](PLANO_EXECUCAO_MARCIA.md)
3. [Produto, UX e roadmap](plano/01_PRODUTO_UX_ROADMAP.md)
4. [Pesquisa e evidências](plano/02_PESQUISA_EVIDENCIAS.md)
5. [Arquitetura, IA e Cloudflare](plano/03_ARQUITETURA_IA_CLOUDFLARE.md)
6. [Segurança, CI, testes e operação](plano/04_SEGURANCA_CI_TESTES_OPERACAO.md)
7. [Modelo de domínio do MVP](plano/05_MODELO_DOMINIO_MVP.md)
8. [Credenciais e acesso judicial](plano/06_CREDENCIAIS_E_ACESSO_JUDICIAL.md)
9. [Tour guiado com destaque](plano/07_TOUR_GUIADO_COM_DESTAQUE.md): implementação, estados de falha, evidência renderizada e validação manual restante.
10. [Hierarquia de ações e cadastros](plano/08_HIERARQUIA_ACOES_E_CADASTROS.md): regra de localização e abertura de formulários.
11. [Execução das consultas processuais](plano/09_EXECUCAO_CONSULTAS_PROCESSUAIS.md): fontes, gates e roteiro por tribunal.
12. [Relatório de homologação judicial](plano/10_RELATORIO_HOMOLOGACAO_JUDICIAL.md): confirmações pendentes e modelos de contato.
13. [Runbook D1/R2 — rascunho não executável em produção](runbooks/RECUPERACAO_D1_R2.md)
14. [Evidência visual local de 19/11/2026](../.local/usability-evidence/brand-review-2026-11-19/manifest.md): hashes do export e screenshots desktop/móvel; ignorada pelo Git e feita com dados sintéticos.

## Decisões arquiteturais

- [ADR 0001 — Autenticação multiplataforma](adr/0001-autenticacao-multiplataforma.md): escolha implementada na fatia local, com gates de segurança/produção pendentes.

## Mapa de pastas atual

- `src/`: site institucional existente e demonstração fictícia pública em `/escritorio`; o produto autenticado vive em app/API separados.
- `apps/mobile/`: app Expo para Web/Android/iOS, com onboarding/login e fluxos persistentes de assuntos, processos manuais, tarefas e financeiro simples.
- `apps/api/`: Cloudflare Worker com D1 local, Better Auth e endpoints de domínio com isolamento por tenant.
- `packages/contracts/`: contratos TypeScript/Zod compartilháveis entre o app e a API.
- `docs/plano/`: documentos de execução e pesquisa divididos por assunto para leitura seletiva de pessoas e agentes.
- `docs/ai/`: instruções e checkpoint curto de retomada; o plano mestre continua sendo a fonte canônica.
- `docs/adr/`: decisões técnicas com contexto, limites e validação pendente.
- `.github/workflows/`: `ci.yml` valida o monorepo em PR e também pode ser iniciado manualmente, sem duplicar a suíte no push do merge; `native-e2e.yml` é manual por plataforma; `pages.yml` mantém a publicação do site no GitHub Pages.
