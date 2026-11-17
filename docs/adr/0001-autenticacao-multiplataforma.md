# ADR 0001 — Autenticação multiplataforma

- **Status:** implementada na fatia MVP local; aprovação para produção pendente
- **Data:** 17/11/2026
- **Responsáveis:** responsável técnico do repositório; Márcia aprova a experiência antes de produção

## Contexto

O produto deve funcionar na Web e em apps Expo nativos Android/iOS, com API no Cloudflare Workers, D1 como banco preferido e isolamento obrigatório por escritório. Sessões/cookies e credenciais não podem ir para o frontend público do site institucional nem para GitHub Pages. O app não pode aceitar cadastro aberto nem confiar em `tenantId` enviado pelo cliente.

## Decisão adotada

Fazer um spike com **Better Auth estável 1.7.25**, adapter D1 nativo e plugin oficial Expo. Criar a instância a partir do `env` de cada requisição Worker, passar secret apenas como secret server-side e usar `CF-Connecting-IP` para identificação de IP/rate limit. Web usa cookie seguro; nativo usa `@better-auth/expo` + `expo-secure-store`. Manter signup público fechado. O primeiro owner é provisionado por rota one-shot com token secreto, claim concorrente atômico, idempotência e estado revogável; a rota deve deixar de aceitar bootstrap depois do owner criado.

A implementação passou setup/login e operações persistentes no E2E Web e Android local, incluindo signup público bloqueado e rejeição de `tenantId` forjado. A jornada completa iOS está configurada para runner macOS e aguarda a conclusão do job na versão final. Sessão revogada/expirada, recuperação de conta, MFA, teste completo com dois tenants e configuração real de Cloudflare ainda estão pendentes. Better Auth não define o modelo de autorização dos dados do escritório: cada rota deriva o tenant da sessão/associação de servidor e confere membership. Não habilitar produção até revisão desses limites.

## Alternativas consideradas

- Cloudflare Access: forte para proteger painel web de operador, mas exige spike específico para login de app nativo e não fornece por si só as sessões/identidades de aplicação e relações tenant necessárias.
- Provedor gerenciado voltado a Expo (ex.: Clerk): pode reduzir trabalho de login, mas adiciona outro serviço de identidade e armazenamento/contrato fora da preferência Cloudflare.
- Auth próprio em Workers: evita dependência, mas aumenta muito o risco/escopo (hash de senha, sessão, recuperação, abuso, MFA, OAuth e revogação) para o MVP.

## Segurança e operação

- Não habilitar verificação/recuperação de senha sem serviço de email e callback real; não mostrar ações quebradas na interface.
- Segredos e chaves de recuperação ficam fora do repositório, em `.dev.vars` local ignorado e Secrets por ambiente no deploy.
- Gerar migrações Better Auth revisadas e incrementais; nunca executar migração remota no startup ou em request de produção.
- D1 não oferece transação interativa. Usar `batch()` para operações atômicas de claim/integridade e validar limites de concorrência.
- Até concluir avaliação LGPD/residência/retention e restore, usar apenas usuários/tenants sintéticos.

## Fontes primárias

- [Better Auth — D1 nativo, versão 1.5](https://better-auth.com/blog/1-5)
- [Better Auth — Cloudflare Workers](https://better-auth.com/docs/guides/cloudflare)
- [Better Auth — integração Expo](https://better-auth.com/docs/integrations/expo)
- [Better Auth — schema e migrações](https://better-auth.com/docs/concepts/database)
- [Expo — SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)

Revalidar versão estável, changelog, advisories, termos e compatibilidade antes de cada release. Ver a pesquisa detalhada em [02_PESQUISA_EVIDENCIAS.md](../plano/02_PESQUISA_EVIDENCIAS.md).
