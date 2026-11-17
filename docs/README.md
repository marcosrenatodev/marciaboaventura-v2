# Documentação do projeto

## Comece por aqui

1. [Plano mestre e retomada](PLANO_EXECUCAO_MARCIA.md)
2. [Produto, UX e roadmap](plano/01_PRODUTO_UX_ROADMAP.md)
3. [Pesquisa e evidências](plano/02_PESQUISA_EVIDENCIAS.md)
4. [Arquitetura, IA e Cloudflare](plano/03_ARQUITETURA_IA_CLOUDFLARE.md)
5. [Segurança, CI, testes e operação](plano/04_SEGURANCA_CI_TESTES_OPERACAO.md)
6. [Modelo de domínio do MVP](plano/05_MODELO_DOMINIO_MVP.md)

## Decisões arquiteturais

- [ADR 0001 — Autenticação multiplataforma](adr/0001-autenticacao-multiplataforma.md): escolha implementada na fatia local, com gates de segurança/produção pendentes.

## Mapa de pastas atual

- `src/`: site institucional existente e demonstração fictícia pública em `/escritorio`; o produto autenticado vive em app/API separados.
- `apps/mobile/`: app Expo para Web/Android/iOS, com onboarding/login e fluxos persistentes de assuntos, processos manuais, tarefas e financeiro simples.
- `apps/api/`: Cloudflare Worker com D1 local, Better Auth e endpoints de domínio com isolamento por tenant.
- `packages/contracts/`: contratos TypeScript/Zod compartilháveis entre o app e a API.
- `docs/plano/`: documentos de execução e pesquisa divididos por assunto para leitura seletiva de pessoas e agentes.
- `docs/adr/`: decisões técnicas com contexto, limites e validação pendente.
- `.github/workflows/`: `ci.yml` valida o monorepo em PR e push para `main`; `pages.yml` mantém a publicação do site no GitHub Pages.
