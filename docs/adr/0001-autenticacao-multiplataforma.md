# ADR 0001 — Autenticação multiplataforma

- **Status:** implementada na fatia MVP local; aprovação para produção pendente
- **Data:** 17/11/2026
- **Responsáveis:** responsável técnico do repositório; Márcia aprova a experiência antes de produção

## Contexto

O produto deve funcionar na Web e em apps Expo nativos Android/iOS, com API no Cloudflare Workers, D1 como banco preferido e isolamento obrigatório por escritório. Sessões/cookies e credenciais não podem ir para o frontend público do site institucional nem para GitHub Pages. O app não pode aceitar cadastro aberto nem confiar em `tenantId` enviado pelo cliente.

## Decisão adotada

Fazer um spike com **Better Auth estável 1.7.25**, adapter D1 nativo e plugin oficial Expo. Criar a instância a partir do `env` de cada requisição Worker, passar secret apenas como secret server-side e usar `CF-Connecting-IP` para identificação de IP/rate limit. Web usa cookie seguro; nativo usa `@better-auth/expo` + `expo-secure-store`. Manter signup público fechado. O primeiro owner é provisionado por rota one-shot com token secreto, claim concorrente atômico, idempotência e estado revogável; a rota deve deixar de aceitar bootstrap depois do owner criado.

A implementação passou setup/login e operações persistentes no E2E Web e em uma rodada Android hospedada anterior, incluindo signup público bloqueado e rejeição de `tenantId` forjado. Em 17/11, o E2E Web desktop/móvel autenticou dois owners sintéticos de tenants distintos, comprovou isolamento das listas e bloqueou leituras/escritas por IDs do outro escritório. A jornada Android ampliada da versão atual ainda aguarda rodada candidata. **Por decisão do usuário, iOS está adiado para uma sessão manual futura; não incluir `ios` ou `all` antes de o usuário definir essa ocasião.** E2E da MFA e recuperação por e-mail, revalidação de sessão/revogação, repetição do isolamento no nativo, sender Cloudflare real e configuração remota continuam pendentes. Better Auth não define o modelo de autorização dos dados do escritório: cada rota deriva o tenant da sessão/associação de servidor e confere membership. Não habilitar produção até revisão desses limites.

Complemento de 18/11/2026: Better Auth `1.7.25` agora usa o plugin oficial TOTP com códigos de recuperação cifrados e de uso único. A migration forward-only `0024_two_factor_authentication.sql` adiciona o estado MFA e a tabela do plugin; a tela de Conta permite configurar/confirmar TOTP, regenerar códigos, desabilitar com senha e trocar a senha atual revogando outras sessões. Sessões foram limitadas a 12 h, renovadas a cada 3 h de uso e consideradas frescas por 15 min. A recuperação de senha usa o callback oficial Better Auth, link de uma hora, rate limits, resposta que não revela se a conta existe, revogação das sessões e binding Cloudflare Email Service com `waitUntil`; o código e as telas estão implementados, mas só houve simulação Wrangler local e o link/token aparece em log/arquivo temporário. O sender real exige configuração de domínio/plano ainda não feita. Segundo fator e reset continuam aguardando E2E final Web/Android; a conta owner deverá habilitar MFA antes do piloto. Break-glass se a pessoa perder senha e todos os fatores segue pendente.

## Alternativas consideradas

- Cloudflare Access: forte para proteger painel web de operador, mas exige spike específico para login de app nativo e não fornece por si só as sessões/identidades de aplicação e relações tenant necessárias.
- Provedor gerenciado voltado a Expo (ex.: Clerk): pode reduzir trabalho de login, mas adiciona outro serviço de identidade e armazenamento/contrato fora da preferência Cloudflare.
- Auth próprio em Workers: evita dependência, mas aumenta muito o risco/escopo (hash de senha, sessão, recuperação, abuso, MFA, OAuth e revogação) para o MVP.

## Segurança e operação

- O código de recuperação de senha só é incluído quando `PASSWORD_RESET_ENABLED`, `AUTH_EMAIL_FROM` e binding `EMAIL` existem; o Worker usa o callback Better Auth e `waitUntil`. A simulação local não envia e-mail, mas grava o link/token em saída temporária. Produção permanece bloqueada até autenticar domínio/remetente no Cloudflare Email Service, conferir plano/limites, observar entrega e completar E2E; não mostrar promessa de entrega enquanto esse gate não estiver ativo.
- Segredos e chaves de recuperação ficam fora do repositório, em `.dev.vars` local ignorado e Secrets por ambiente no deploy.
- Gerar migrações Better Auth revisadas e incrementais; nunca executar migração remota no startup ou em request de produção.
- D1 não oferece transação interativa. Usar `batch()` para operações atômicas de claim/integridade e validar limites de concorrência.
- Até concluir avaliação LGPD/residência/retention e restore, usar apenas usuários/tenants sintéticos.

## Fontes primárias

- [Better Auth — D1 nativo, versão 1.5](https://better-auth.com/blog/1-5)
- [Better Auth — Cloudflare Workers](https://better-auth.com/docs/guides/cloudflare)
- [Better Auth — integração Expo](https://better-auth.com/docs/integrations/expo)
- [Better Auth — schema e migrações](https://better-auth.com/docs/concepts/database)
- [Better Auth — TOTP, códigos de recuperação e lockout](https://better-auth.com/docs/plugins/2fa)
- [Better Auth — sessões e frescor](https://better-auth.com/docs/concepts/session-management)
- [Expo — SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)

Revalidar versão estável, changelog, advisories, termos e compatibilidade antes de cada release. Ver a pesquisa detalhada em [02_PESQUISA_EVIDENCIAS.md](../plano/02_PESQUISA_EVIDENCIAS.md).
