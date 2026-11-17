# 04 — Segurança, CI, testes e operação

## 1. Dados jurídicos e privacidade

Antes de usar qualquer caso real, elaborar com Márcia uma avaliação de dados/processamento: controlador/operador, finalidade, base legal, dado pessoal/sensível, segredo profissional, pessoa autorizada, região/subprocessador, transferência internacional, acesso do provedor/modelo, retenção, exportação, exclusão, incidente e exercício de direitos. Conferir a [Resolução CD/ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024) e mecanismo aplicável com orientação especializada. Cloudflare D1/R2 não oferecem localidade Brasil como promessa documentada nas páginas consultadas; account location hints são diferentes de garantia de residência. A avaliação é um requisito de produto e segurança, não um parecer jurídico automático.

- Um tenant inicial e user owner; RBAC desde API, `tenantId` em cada tabela e testes que tentam acesso cruzado. Para equipe, ACL por caso/documento e princípio do menor privilégio.
- Cifrar em trânsito TLS, manter dados em repouso cifrados (Cloudflare documenta encriptação provider-managed em R2/Durable Objects), e avaliar criptografia application-level para documentos especialmente sensíveis. Segregar chave de criptografia, valores cifrados, ambiente e backups; plano de rotação/perda de chave.
- D1 contém só dados operacionais/metadados essenciais; R2 privado, sem bucket público; URL de acesso curta/assinada pelo Worker; validar MIME/tamanho/hash/malware; impedir public bucket policies.
- Não coletar CPF/telefone/endereço/documento se não for necessário; mascarar PII em tela/log/alerta; push não contém nome de cliente, parte, teor sensível ou prazo detalhado na lockscreen.
- Logs de auditoria append-only lógico para login, view/download, conexão/revogação, update/delete, assinatura e confirmação de publicação/prazo. Não registrar corpo legal em access logs. Definir política de retenção separada para evidência de assinatura e logs de segurança.
- Backups/encriptação gerenciada não são suficiente: export test, recuperação de arquivo, restauração de banco, runbook e simulado de perda de integração antes do go-live.
- MFA e sessões curtas para operações críticas; suporte a passkeys/biometria apenas para desbloqueio local (biometria do telefone não substitui identificação de signatário externo).
- Privacy-by-default: sem compartilhar/adicionar cliente a IA, chat externo, drive ou marketing sem escolha clara. Não aproveitar D1/Drive para treinar modelo.

## 2. Segredos e integrações

- Secrets de deploy em GitHub Environments/Cloudflare Secrets Store ou Worker secrets; jamais commit, build bundle, app mobile, `VITE_*`, issue, Slack, screenshot ou log. Secrets de APIs de terceiros não se tornam secrets de Cloudflare API account.
- Se o app oferecer configuração de credencial do próprio escritório, POST autenticado ao backend e cifrar envelope antes de persistir; API nunca entrega segredo no GET. Campo com reveal inicial, depois máscara, rotação e delete; auditoria; rate limit; evitar clipboard involuntário.
- Cloudflare API tokens com escopo e conta/serviço mínimos. Uma tela de configuração não deve guardar token global Cloudflare com permissão de Account Edit. Para criar Workers Secret Store a partir do produto, provar permissão mínima e threat model; se não for possível com segurança, instruir admin a instalar via dashboard/CLI com comando seguro e depois conectar no app.
- Webhooks: HTTPS, assinatura HMAC conforme fornecedor, comparação constante-time, timestamp/replay-window quando disponível, limite de corpo, schema/tipo version tolerant, idempotency key, persistência durável antes do 2xx, retry, DLQ e alerta. Webhook é sinal, não verdade final; buscar estado provider e reconciliar.
- OAuth Drive: state/nonce/PKCE, redirect URI exact, menor escopo, access/refresh tokens cifrados no backend, rotate/revoke, never localStorage. Revalidar acesso do usuário e permission/ACL ao recuperar conteúdo, não só na ingestão.
- Classificar credencial por função antes de implementar a tela: (a) IDs/redirects são configuração de app; (b) Google Picker API key é pública e restringida por origem/API; (c) OAuth access/refresh token pertence à conexão consentida de cada usuário; (d) OAuth client secret/certificado é segredo operacional; (e) Cloudflare account token é segredo administrativo e não entra no fluxo da usuária. Nunca gravar client secret/certificado como token OAuth de usuário ou usar uma Google API key como autorização para arquivo privado.
- Configuração self-service de credenciais exige endpoints backend separados para gravação/substituição e status mascarado; autenticação de owner/admin, MFA/step-up, CSRF, rate limit, auditoria sem valor, envelope encryption com chave separada do D1 e política documentada de rotação/expurgo. GET retorna somente `configured`, fingerprint não reversível/últimos caracteres se aprovado e data de atualização; não retorna o valor. Para segredos de deployment, preferir GitHub Environment/Cloudflare dashboard/Secrets Store. Não delegar Cloudflare API token amplo ao app: se não houver permissão mínima demonstrada, a configuração do deployment é manual e a aplicação apenas verifica conectividade.
- A tela deve explicar scopes e impacto antes do consentimento, exibir conta e acesso concedido, último sucesso/erro e controles separados de desconectar conta, revogar consentimento e apagar índice. Desconectar deve parar jobs e revogar token no provedor quando possível; remoção de dados/índice fica auditada. `Testar configuração` é distinto de `Conectar conta` e nunca deve simular sucesso sem chamada real autorizada.
- Gate SaaS judicial: não usar scraping, automação de login ou certificado da advogada como fallback. Só habilitar adapter com contrato/termos, matriz de cobertura, direitos de armazenamento/redistribuição, DPA/subprocessadores, quotas e canal de suporte revisados; manter feed oficial/terceirizado rotulado, atraso/health visível e revisão humana. Alertas não confirmam ciência nem prazo.
- Gate AI/RAG: bloqueio por tenant/caso validado no servidor antes do retrieval e antes de responder; só conteúdo autorizado entra na fila de ingestão; logs, analytics e Gateway sem payload por padrão; avaliação de citações/prompt injection/recusa, expurgo de conversa e vetor, revisão humana e kill switch antes de qualquer documento identificável.
- Arquivos recebidos são input não confiável: tratar macro/HTML/prompt injection, vírus, PDF malformado, zip bomb, OCR indevido, links remotos e HTML/scripts; parse isolado com limite de CPU/tamanho.

## 3. CI e acompanhamento no GitHub

### Estado atual

`.github/workflows/ci.yml` roda em pull requests e push para `main`, com permissões somente de leitura, Node `.node-version` (22.14.0), pnpm 10.27.0 e `pnpm install --frozen-lockfile`. Valida lint/test/build do site, contratos, API e app mobile; exporta o app; tipa os testes; roda Playwright Chromium desktop/mobile e WebKit mobile; guarda relatório HTML por 7 dias. `.github/workflows/native-e2e.yml` constrói development clients Android e iOS e executa o fluxo persistente completo em ambos com `.maestro/office-workspace.yaml`. Actions são SHA-pinned; Dependabot atualiza semanalmente. Workflows não fazem deploy de app/API. `.github/workflows/pages.yml` continua responsável, separadamente, pela publicação apenas do site no GitHub Pages: `build` gera o artifact e `deploy` o publica no environment `github-pages`, com permissões mínimas em cada job. `pnpm-workspace.yaml` mantém `allowBuilds` restrito às versões travadas de SWC, esbuild e workerd necessárias ao install/build/runtime local.

Validação local observada em 17/11/2026: passaram typechecks de contracts/API/mobile/E2E, lint, testes e build do site, export web Expo e `git diff --check`. `pnpm --filter @marcia/api build` concluiu `wrangler deploy --dry-run` sem publicar. Workflows e arquivos Maestro passaram análise sintática YAML. Playwright renderizou desktop Chromium, mobile Chromium e site público com `/escritorio`: 3/3 passaram; o fluxo verifica setup, processo, financeiro com vencimentos, busca/cópia e abertura da fonte oficial TRF4, persistência, sessão/tenant, screenshots e responsividade. WebKit está configurado em runner hospedado; o binário não é suportado pelo Ubuntu 20.04.6 deste host. No segundo run de CI (`44052757062`), todos os checks anteriores ao Playwright passaram; WebKit falhou ao pedir a permissão não suportada `clipboard-write` e o retry reutilizou registros sintéticos. O teste foi ajustado para pular a permissão/leitura direta no WebKit e gerar fixtures únicas por tentativa; `pnpm typecheck:e2e`, a jornada local Chromium/site (3/3) e YAML passaram após o ajuste. O novo resultado hospedado ainda está pendente.

Maestro Android API 36 havia passado 1/1 (3m25s) em uma versão anterior da UX. A repetição após mover a busca de processos e incluir vencimentos financeiros não concluiu neste host: Android exibiu “System UI isn't responding”. `/dev/kvm` está ausente e o emulador local usa virtualização por software. O fluxo foi simplificado para abrir o app pelo deep link do Expo e a CI hospedada mantém KVM habilitado; ainda é necessário registrar o resultado remoto. O APK development/debug já compilou com `BUILD SUCCESSFUL` (11m17s); não é pacote de distribuição. D1 e fixtures usados localmente são descartáveis.

O E2E nativo iOS não roda neste host Linux sem Xcode. No run `44055069612`, o Android compilou com sucesso e a API/D1 local aplicou as migrations; a inicialização parou porque o Expo SDK 58 rejeita `--non-interactive`. No run `ff765d3`, Android compilou e a API/D1 iniciou, mas a sonda do Metro expirou em 90 segundos enquanto o Expo ainda subia. Os jobs agora usam `CI=1`, sondas independentes, logs de progresso e janela de 180 segundos; o iOS ainda compilava na última consulta. A jornada precisa ser executada em novo run antes de declarar E2E nativo verde ou aprovação de Márcia.

### Próximas melhorias de CI

1. `ci.yml` já executa lockfile congelado, lint/test/build do site, contratos, API e Expo, export web e E2E. Ainda não há format check separado, matriz completa de unit/integration tests nem teste automatizado de migração/restore D1.
2. **Implementado em `ci.yml`:** Playwright Chromium desktop + mobile e WebKit mobile em GitHub Linux, dados sintéticos, trace/screenshots apenas sob falha; o run local Linux observado incluiu os dois projetos Chromium. O Playwright WebKit não é suportado no Ubuntu 20.04 deste host.
3. **Implementado em `native-e2e.yml`:** emulator Android no Ubuntu com SDK 36, Maestro completo do primeiro owner a lançamento financeiro; artifacts limitados a relatório/screenshot sanitizado.
4. **Implementado em `native-e2e.yml`:** simulator iOS no runner `macos-26`, Expo SDK 58 e a mesma jornada completa de Android. O job deve confirmar build, launch URL, selectors e operações persistentes em macOS; host local Linux não executa Xcode.
5. `security.yml` separado ainda não existe: avaliar dependency review, CodeQL, auditoria de dependências/licenças e secret scanning/push protection conforme recursos do plano; Dependabot semanal já está configurado.
6. Deploy preview da API/app não existe e não será habilitado antes de decidir hosting privado, ambiente protegido e revisão de dados. O workflow Pages existente publica o site raiz em job de build/deploy separado.
7. `e2e-synthetic-monitor.yml` é opcional: smoke futuro com conta/fixture isolada, sem coletar resposta jurídica ou segredo.

### Visibilidade para a dona do projeto

- PR mostra checks com nomes estáveis, duração, link para preview, prints/trace em falha, migration diff, changelog e lista de decisões/risco.
- `main` exige checks, revisão humana (Márcia para fluxos e owner técnico para arquitetura), branch atualizada e bloqueio de force-push; alterações em migrations, auth, providers, signing e AI prompts exigem reviewer responsável.
- **Pendente no GitHub:** a regra de proteção da branch `main` é configuração do repositório e não foi aplicada por estes arquivos; ativar depois do primeiro run, usando os nomes estáveis dos checks. Secret scanning/push protection e CodeQL também dependem da configuração/entitlement do repositório.
- README explica: o que CI roda, como abrir PR, como interpretar a falha, onde achar relatório e como rollback.
- Não usar IA para aprovar a própria alteração de segurança ou gerar/clicar approve; agentes precisam declarar ferramentas/comandos executados e não executados.

Fontes oficiais: [GitHub secure use of Actions](https://docs.github.com/en/actions/reference/security/secure-use), [proteger branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review), [Expo E2E CI](https://docs.expo.dev/tutorial/cicd/e2e-tests/), [Expo EAS workflow E2E](https://docs.expo.dev/eas/workflows/examples/e2e-tests/), [GitHub runners e labels macOS](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) e [Expo SDK 58/Xcode/Android matrix](https://docs.expo.dev/versions/v58.0.0/).

## 4. Estratégia de testes

O usuário pediu E2E em todas as plataformas; isso é critério explícito. Usar somente fixtures sintéticas e ambientes de sandbox.

- **Unitário:** regras de domínio, cálculo monetário, normalização CNJ (sem inferir prazos), validation schemas, ranker, parser, idempotência e policy checks.
- **Integração:** D1 local/migrations, R2 fake/local, filas e webhooks; providers com mocks gravados de dados públicos documentados, jamais fixture contendo tokens/pessoas reais; migrations forward/rollback/restore.
- **Contract tests:** schema e erros dos providers, webhook HMAC, OAuth callback, Graph Delta/Drive changes com fixtures; provider sandbox se termos autorizarem.
- **E2E Web:** onboarding sintético, busca processo, revisão de publicação, confirmação manual, tarefa, financeiro, pesquisa jurisprudência com fonte, Drive selecionado, signature sandbox e status de configuração.
- **E2E Android/iOS nativos:** mesmo fluxo prioritário, offline rascunho e sync, biometria sem colocar segredo no dispositivo, upload/share sheet/câmera conforme release; assert de deep link, push privacy e tamanhos/touch.
- **Visual/accessibility:** Playwright axe + auditoria manual com teclado/leitor, contraste, zoom/Dynamic Type; screenshots em viewport pequeno, tablet, desktop; reduzir snapshot noise.
- **Performance:** Web Vitals e API timings com cenários medidos; device cold start; network throttling; consulta de pesquisa externa medida em separado; carga burst de webhook e D1 queue; alertar custo de IA/document ingestion.
- **AI evals:** corpus de decisões públicas permitidas e questões sintéticas aprovadas por Márcia; avaliação explícita de citações, autoridade, cobertura contrária, confiança, prompt injection e refusals. Não usar LLM-as-judge como única métrica.
- **Resiliência:** provedor indisponível/timeout/429, evento duplicado e fora de ordem, token revogado, Drive file deleted, assinatura webhook forjada, D1 overloaded, job abandonado e upload malicioso.

Gate de release: todos os P0 E2E passam; nenhum dado entre tenants; nenhuma assinatura não verificada; nenhum prazo sem etapa de confirmação; restore ensaiado; não existem vulnerabilidades críticas abertas; Márcia aprovou os caminhos mais frequentes.

## 5. Performance e custo

- Evitar cold-start/latência de API: código e imports leves, cache de assets públicos, batches e índices D1, queries paginadas, evitar queries N+1/`SELECT *`, otimizar bundle e carregamento progressivo; não cachear conteúdo confidencial.
- Orçamento de UI: LCP p75 < 2.5 s como objetivo inicial, INP < 200 ms e CLS < 0.1 como metas; confirmar em ferramentas e escala real. Mobile prioriza resposta percebida e placeholder local.
- Sinal inicial do protótipo em 16/11/2026: Vite ainda avisa que o bundle da página principal ultrapassa 500 kB (516.16 kB / 166.93 kB gzip); a tela `/escritorio` foi separada em chunk lazy de 30.60 kB / 8.10 kB gzip. O build atual não mediu LCP real. Antes da migração, analisar o bundle principal e tratar imagens/fontes/imports; não suprimir o aviso sem medição.
- API simples: p95 < 300 ms sem provider externo, objetivo inicial; jobs de terceiros devolvem estado processando e notificam quando pronto. Timeout por provedor; retry seletivo com backoff e jitter; circuit breaker/adaptive rate limit.
- D1 limites, cotas por conta e preço, Queue/Workflows, AI Search/Vectorize, embeddings/OCR, tokens e preço da API judicial/assinatura entram no budget dashboard. Limite mensal com alertas e kill switch para recursos pagos de IA.
- Medir custo por pesquisa, documento indexado, publicação monitorada, assinatura e usuário ativo. Apresentar custo aproximado na configuração de integração quando possível.

## 6. Incidente, backup e continuidade

- Runbooks versionados: baixar/validar backup, recuperar D1, recuperar objeto R2, invalidar segredo/API key, reconectar Google/Microsoft, reprocessar evento da DLQ, cancelar/reconciliar assinatura, corrigir relógio/data de publicação, trocar provider, interromper feature AI e comunicar incidente.
- Snapshot/export em cadência definida conforme criticidade e termos; cópia cifrada e isolada da conta primária; testar restauração periódica e provar integridade com contagem/hash.
- Monitorar health de APIs, atraso do último evento, filas/DLQ, tokens OAuth vencendo, webhook inválido, divergência de cobertura, storage/rate/custos, disponibilidade do chat e falha de upload. Sem corpos de processo/documento em observability.
- Alertas de notificação têm redundância: app push/email configuráveis e visão “integração atrasada”; não prometer 100% de entrega.
- Data export e apagamento implementados com trilha; quando contrato/lei exigir retenção de evidência, apresentar à pessoa responsável antes de apagar e deixar escopo explícito.

## 7. Definição de pronto e revisão

Todo PR deve trazer problema/jornada, screenshots antes/depois se UI, teste correspondente, risco de privacidade/legal, origem dos dados, custo/latência se integração e documentação/instruções atualizadas. Reviews humanos cobrem comportamento e direito; revisão AI cobre checklist rastreável, mas não aprova. Rodar verificações requisitadas e escrever exatamente o resultado; não reportar “testado” se só leu o código.

Toda integração de terceiros tem um `ADR` com justificativa, licenças, preço, SLA/cobertura, permissões, dados enviados/retidos, falhas, cancelamento e alternativa manual. Toda capacidade AI tem eval e rollback de versão.
