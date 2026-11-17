# API — autenticação inicial (ambiente local)

Cloudflare Worker com Better Auth 1.7.25, plugin Expo e D1. Oferece liveness, rotas de autenticação, bootstrap one-shot do primeiro owner e uma fatia inicial para assuntos, casos, tarefas, compromissos, lançamentos financeiros e consultas de jurisprudência salvas. Auth e schema ainda não estão aprovados para dados reais nem produção; deploy continua bloqueado.

## API de domínio (fatia inicial)

As rotas exigem sessão Better Auth válida e membership em `tenant_memberships`. O tenant é sempre derivado no servidor; contratos de entrada rejeitam campos extras, inclusive `tenantId`. Leituras e escritas são filtradas pelo tenant da sessão, vínculos usam FKs compostas e acessos ausentes/fora do tenant respondem `404`. Criações e mudanças de status gravam evento de auditoria na mesma operação D1.

- `GET /api/session` retorna `{ user, tenant: { id, role } }`.
- `GET/POST /api/matters` e `POST /api/matters/:id/archive`.
- `GET/POST /api/court-cases` e `POST /api/court-cases/:id/archive`.
- `GET/POST /api/tasks`; `POST /api/tasks/:id/status` altera o estado.
- `GET/POST /api/appointments`; `POST /api/appointments/:id/cancel` ou `POST /api/appointments/:id/status`.
- `GET/POST /api/financial-entries`; `POST /api/financial-entries/:id/cancel` ou `POST /api/financial-entries/:id/status`.
- `GET/POST /api/legal-researches`; a gravação aceita questão de até 600 caracteres e um `courtId` de catálogo (`TJPR`, `TJSC`, `TJRS`, `TRF4`, `STJ`, `STF`). A URL do portal é determinada no Worker. Não há busca automática, resultados, conteúdo de ementa ou scraping.

Listas retornam `{ items: [...] }` com limite fixo de 100; criações retornam `{ item: ... }`. As entradas e respostas usam os schemas estritos de `packages/contracts`. `caseNumber` é opcional e armazenado como informado; não há validação nem normalização CNJ nesta fatia. Uma tarefa agendada é organização de rotina, não prazo processual confirmado. Não há atualização genérica, restauração, hard delete, paginação por cursor, idempotência nem endpoint de auditoria nesta etapa.

## Configuração local

1. Copie `.dev.vars.example` para `.dev.vars` dentro de `apps/api`.
2. Troque os valores de exemplo por valores locais. Gere `AUTH_SECRET` e `SETUP_OWNER_TOKEN` localmente com `openssl rand -base64 32`; nunca os reutilize nem os committe. `SETUP_OWNER_TOKEN` deve ser mantido fora do app e enviado somente no bootstrap inicial.
3. Confira `WEB_ORIGIN` contra a origem exata em que o Expo Web roda. O scheme nativo permitido é `marcia-demo://`, definido em `apps/mobile/app.json`. Não use curingas nem permita `null`.
4. Na raiz do monorepo, execute:

```sh
pnpm --dir apps/api generate-types
pnpm --dir apps/api typecheck
pnpm --dir apps/api db:migrate:local
pnpm --dir apps/api build
pnpm --dir apps/api dev
```

`AUTH_BASE_URL` deve ser a origem da API, com `/api/auth` como base path implícito; em local use `http://127.0.0.1:8787`. `WEB_ORIGIN` é a origem web exata, por exemplo `http://localhost:8081`. O CORS aceita credentials e somente `WEB_ORIGIN` e `marcia-demo://`. `CF-Connecting-IP` é o único header configurado para a leitura do IP pelo Better Auth. No deploy remoto, a Cloudflare deve fornecer esse header; não confie em `X-Forwarded-For` enviado pelo cliente.

O setup usa `POST /api/setup/owner` com `{ "name", "email", "password", "setupToken" }`. Após aplicar migrations, ele valida o token, toma claim atômico no D1, cria ou retoma a autenticação do mesmo e-mail após falha transitória, e associa o usuário a um tenant como owner. Respostas concorrentes são serializadas; um índice único permite um owner por tenant e `setup_control` funciona como gate global do primeiro owner. O claim expira em 10 minutos para permitir retry após interrupção. Depois de concluído, o endpoint retorna `409`; remova `SETUP_OWNER_TOKEN` do ambiente assim que o owner estiver provisionado.

O Better Auth grava rate limits no D1 (`rateLimit`), compartilhado entre isolates, e aplica limite específico de cinco tentativas por minuto em `/api/auth/sign-in/email`. O endpoint de setup valida o token e usa claim, mas não passa pelo limitador Better Auth. **Antes de qualquer bootstrap remoto, configure uma regra Cloudflare Rate Limiting para `POST /api/setup/owner`**, por IP de origem, com bloqueio temporário após poucas tentativas. Não habilite esse endpoint remotamente até confirmar a regra na zona/ambiente correspondente; o Worker continua bloqueado para deploy.

O bootstrap retorna a resposta de sessão do Better Auth. Use-a uma vez a partir do cliente de confiança. Não registre o body, cookies, senha ou token. O cadastro por `POST /api/auth/sign-up/email` permanece fechado em todas as requisições públicas. Login e logout ficam em `/api/auth/sign-in/email` e `/api/auth/sign-out`.

## Schema e segurança

`0001_initial_schema.sql` é a migração original do scaffold. `0002_auth_and_owner_setup.sql` preserva sua antiga tabela `users` como `legacy_tenant_users`, cria as tabelas Better Auth (`user`, `session`, `account`, `verification`), o vínculo `tenant_memberships` e o controle one-shot. `0003_auth_rate_limits_and_owner_index.sql` cria a tabela padrão `rateLimit` do Better Auth e corrige o índice para permitir um owner por tenant. `0004_domain_slice.sql` cria `matters`, `court_cases`, `tasks`, `appointments`, `financial_entries` e `audit_events`. `0005_legal_research.sql` cria consultas genéricas salvas com isolamento por tenant e trilha de auditoria própria. Migrations são aplicadas via Wrangler, nunca dentro de requests. A tabela `organizations` é criada sem tenant inicial; o bootstrap cria o primeiro escritório.

As dependências de auth e Expo estão fixadas sem range em `1.7.25`. A factory cria Better Auth por request usando o binding D1 e os secrets daquele ambiente. A instância temporária com signup habilitado existe somente dentro do handler de bootstrap; o roteamento HTTP normal sempre usa signup desabilitado. `AUTH_SECRET` precisa ser aleatório e único por ambiente.

Não há autenticação multiusuário por convite, MFA, verificação/recuperação de email, RBAC por entidade ou seletor de tenant quando uma pessoa pertence a mais de um escritório. As rotas de domínio validam sessão e membership e usam o tenant escolhido pelo servidor; a integridade composta não substitui a autorização. Antes de dados reais, revisar sessões/cookies e deep links em Web/iOS/Android, MFA, recuperação de conta, CORS, export/restore, localização/transferência Cloudflare, logs e isolamento com testes entre tenants. Email/password não habilita recuperação por email sem serviço de email.

`/health` é apenas liveness (`productionReady: false`, `database: not_checked`). Não comprova D1, migrações nem login.

## Deploy bloqueado

Não fazer deploy. `wrangler.jsonc` conserva o ID D1 inválido, `remote: false`, `workers_dev: false`, `preview_urls: false` e nenhuma rota. O script `deploy` falha intencionalmente. `.dev.vars.example` contém placeholders locais e não é configuração de produção. Produção exige revisão específica de conta, ambiente, localização/transferência internacional, secrets, CORS/origins e gates de auth; não basta trocar o ID.

## Checks desta fatia

Registrar no plano mestre os comandos realmente executados. Typecheck e build dry-run não provam sign-in/out, migrations no runtime D1 ou isolamento. A tentativa local `wrangler d1 migrations apply DB --local` pode falhar se o ambiente não permitir loopback; nesse caso registrar a mensagem literal e validar o SQL em SQLite temporário sem alegar que D1 passou.
