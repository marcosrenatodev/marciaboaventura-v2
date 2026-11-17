# Márcia — site e plataforma jurídica

Este repositório mantém o site institucional público no diretório raiz e inicia, em aplicações separadas, uma plataforma de produtividade jurídica para Márcia. O site não recebe dados de clientes; o produto autenticado não é publicado no GitHub Pages.

## Estado atual

- `src/`: site institucional Vite/React original e a demonstração fictícia `/escritorio`. Essa rota é pública, usa exemplos em memória e não oferece controle de acesso; ela será publicada junto com o site quando `main` disparar Pages.
- `apps/mobile/`: app Expo/React Native em TypeScript para Web, Android e iOS. O app tem login/setup owner e fluxos persistentes de assuntos, processos manuais, tarefas, compromissos, financeiro simples e pesquisa jurídica guiada.
- `apps/api/`: Cloudflare Worker + D1 local com Better Auth e endpoints de domínio protegidos por tenant.
- `packages/contracts/`: contratos TypeScript/Zod compartilhados.
- `docs/PLANO_EXECUCAO_MARCIA.md`: visão completa, estado, decisões e próximo passo de execução.

Esta é uma primeira fatia funcional, ainda não um produto pronto para dados de clientes: não consulta tribunais, não monitora publicações, não calcula prazo, não conecta Drive/OneDrive, assinatura, jurisprudência licenciada ou IA. Use apenas dados inventados até concluir revisão de segurança e ativar provedores por contrato/credenciais. Os ZIPs fornecidos contêm informação jurídica/pessoal e não devem ser copiados para código, prompt, screenshot, fixture ou teste.

## Requisitos e instalação

Use Node `22.14.0` (`.node-version`) e pnpm `10.27.0` (`packageManager`). Na raiz:

```sh
pnpm install --frozen-lockfile
```

O workspace libera scripts de build apenas para as versões travadas de SWC, esbuild e workerd necessárias às ferramentas atuais. O lockfile é único na raiz.

## Comandos de desenvolvimento

### Site institucional (root)

```sh
pnpm dev
pnpm lint
pnpm test
pnpm build
```

O workflow `pages.yml` continua publicando somente o build do site raiz no GitHub Pages.

### App Expo

```sh
pnpm --filter @marcia/mobile start
pnpm --filter @marcia/mobile export:web
pnpm --filter @marcia/mobile typecheck
pnpm --filter @marcia/mobile lint
```

O Android requer SDK/JDK/emulador ou dispositivo. Build iOS requer macOS e Xcode. A exportação web é artefato local, não publicação privada.

### API Cloudflare

```sh
pnpm --filter @marcia/api typecheck
pnpm --filter @marcia/api build
pnpm --filter @marcia/api db:migrate:local
pnpm --filter @marcia/api dev
```

O Worker está configurado para desenvolvimento local, sem rota pública, com deploy bloqueado. Não apontar para D1 remoto nem adicionar segredo ao Git. Consulte o README específico da API antes de executar migrações ou configurar secrets.

### Contratos

```sh
pnpm --filter @marcia/contracts typecheck
```

## CI e testes

`.github/workflows/ci.yml` valida PRs e pushes a `main`, incluindo lint, testes, builds e Playwright E2E em Chromium desktop/mobile, site público e WebKit mobile no runner hospedado. `.github/workflows/native-e2e.yml` constrói Android e iOS e executa a mesma jornada Maestro nos dois: onboarding, assuntos, processo manual, tarefa, compromisso, financeiro e busca TRF4. Em 17/11/2026 o E2E Web passou 3/3 localmente. O último E2E Android local não concluiu porque este host não tem KVM e o System UI do emulador entrou em ANR; o workflow hospedado é o gate para a versão atual. A primeira CI remota identificou problemas corrigidos neste branch; o estado final dos novos jobs deve ser registrado no plano mestre antes de afirmar que tudo passou. `.github/workflows/pages.yml` continua publicando somente o site público raiz em push a `main`, sem publicar app/API. Comandos locais: `pnpm e2e:web` e `pnpm typecheck:e2e`.

## Continuidade e decisões

Leia [o plano mestre](docs/PLANO_EXECUCAO_MARCIA.md) antes de continuar. Instruções curtas por pasta ficam em `AGENTS.md`/`CLAUDE.md`; decisões arquiteturais com ressalvas ficam em `docs/adr/`; a pesquisa com fontes está em `docs/plano/02_PESQUISA_EVIDENCIAS.md`.
