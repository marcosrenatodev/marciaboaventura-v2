# 03 — Arquitetura TypeScript, IA, drives e Cloudflare

## 1. Direção de arquitetura

### Stack candidata

- **Web institucional:** manter Vite + React + TypeScript/Tailwind no começo e publicar estaticamente via Cloudflare Pages/Workers, sem dados privados.
- **App web + Android + iOS:** implementação usa Expo SDK 58 + React Native 0.88 + Expo Router + React Native Web e TypeScript. A matriz oficial consultada em 16/11/2026 indica SDK 58; Node 22.14.0 atende ao mínimo verificado. O development client Android foi compilado e o E2E Web passou; a mesma jornada nativa está configurada para Android e iOS, com confirmação dos runners hospedados registrada no plano mestre.
- **API e tarefas backend:** Cloudflare Workers com TypeScript e APIs nativas `Request`/`Response`; contracts Zod compartilhados. A fatia atual cobre auth e REST de domínio; Hono, OpenAPI/client, webhooks/cron e workers assíncronos seguem condicionados à expansão de rotas/integrations. Nunca chamar provedor de assinatura, tribunais ou IA com credenciais diretamente do app móvel/web.
- **Banco inicial:** Cloudflare D1, SQLite serverless. Better Auth usa o binding D1 nativo; migrações de auth e domínio estão versionadas e a API local D1 foi testada em E2E. Drizzle continua opção para repositórios tipados, não dependência obrigatória antes de comprovar que simplifica o MVP.
- **Arquivos:** R2 para documentos autorizados, exports, assinados e mídia; metadados e permissão no D1. Não guardar PDF grande em D1. Criptografia de storage documentada pela Cloudflare é provider-managed; para risco profissional avaliar criptografia de conteúdo no app antes do upload, chave/rotação e limites de OCR/indexação.
- **Assíncrono:** Cloudflare Queues para eventos, webhook, ingestão e retry; Workflows para processos duradouros/reconciliação quando adequado; Cron Triggers para renovar canais/poll/reconciliação. Durable Objects apenas quando há coordenação/estado serializado por ator (ex. dedupe/controle de sessão), não por padrão.
- **Busca jurídica/documental:** spike entre AI Search gerenciado e pipeline R2 + Workers AI embeddings + Vectorize com camada de autorização própria. Cloudflare documenta AI Search conectado a R2 e D1 beta, busca lexical/vetorial e híbrida, reranking opcional, citações e multitenancy; para separar escritórios recomenda instância por tenant ou filtro. Provar filtro por cliente/caso e revogação antes de indexar dados de casos.
- **IA/roteamento:** Workers AI e modelos disponíveis ou provedor contratado via AI Gateway, após validar qualidade em português jurídico, custo, latência, retenção e uso de dados. AI Gateway registra logs por padrão em várias configurações: desligar payload para prompt/dados do cliente (`cf-aig-collect-log: false` ou configuração equivalente verificada), desabilitar cache para respostas específicas por cliente e rever Logpush/observabilidade. AI Gateway é roteador/observabilidade, não selo de privacidade.
- **Retenção de IA:** a documentação atual de Workers AI declara processamento de conteúdo apenas pelo tempo necessário para inferência standard e não treinamento com conteúdo do cliente; isso não cobre estado que o produto escolhe guardar em R2/Vectorize/AI Search, logs, cache nem modelos externos via Gateway. Rever termos de cada componente e de cada modelo; desativar payload logs/cache por padrão e implementar exclusão/retention para todo índice e conversa. A configuração dos headers do AI Gateway não desativa automaticamente exportação via Logpush: revisar e desligar Logpush explicitamente em cada dataset que possa receber prompts/conteúdo. Métricas devem usar metadados mínimos e sem corpo.
- **Abuso/edge:** Cloudflare WAF/rate limiting para endpoints sensíveis; Turnstile em formulários públicos. Cloudflare Access pode proteger staging/admin; não substituir mecanismo de autenticação de cliente final.
- **Autenticação:** Better Auth 1.7.25, D1 nativo e plugin Expo estão implementados; cadastro público fechado, owner inicial one-shot, cookies web, SecureStore nativo e rate limit de login. O teste passou no web/Android local, incluindo tentativa de tenant forjado. MFA, recuperação de email, multi-tenant avançado, revisão formal e testes completos de revogação seguem pendentes. Ver [ADR 0001](../adr/0001-autenticacao-multiplataforma.md).
- **Runtime:** usar `asdf` ou `mise` com versão documentada. Repositório e CI fixam Node 22.14.0, pnpm 10.27.0 e JDK Temurin 17; Android build usa SDK API 36. Essa combinação atende à matriz consultada do Expo SDK 58. iOS usa runner macOS/Xcode documentado; a aprovação depende da conclusão da jornada no GitHub Actions.

Fontes técnicas: [Expo latest SDK](https://docs.expo.dev/versions/latest/), [Expo Router](https://docs.expo.dev/versions/latest/sdk/router/), [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [data location D1](https://developers.cloudflare.com/d1/configuration/data-location/), [Workers + databases](https://developers.cloudflare.com/workers/databases/connecting-to-databases/), [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/), [R2 segurança](https://developers.cloudflare.com/r2/reference/data-security/), [AI Search como funciona](https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/), [AI Search multitenancy](https://developers.cloudflare.com/ai-search/how-to/per-tenant-search/), [AI Search fontes](https://developers.cloudflare.com/ai-search/configuration/data-source/), [Vectorize filtros](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/), [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) e [AI Gateway logs](https://developers.cloudflare.com/ai-gateway/observability/logging/).

## 2. D1 no lugar de PostgreSQL: decisão com limites visíveis

O usuário prefere evitar Postgres se Cloudflare D1 atender. Para uma primeira aplicação de escritório pequeno, D1 é escolha viável de produto e reduz conexões/servidores próprios; registrar como preferência padrão do MVP. Não declarar que é ilimitado ou “sempre melhor”.

- Docs consultadas mostram atualmente limite de 10 GB por database pago (500 MB free), limite máximo que não pode ser aumentado; armazenamento total de conta também tem limite de plano.
- Há implicação de localização para uso no Brasil: D1 documenta jurisdições `eu`, `fedramp` e `us`; location hint `sam` não é suportado. R2 documenta jurisdições `eu`, `fedramp`, `us` e hints WNAM/ENAM/Europa/APAC/Oceania; hint é best-effort e não garante localidade. Assim, não prometer banco/arquivo em São Paulo ou Brasil. Confirmar localização real, subprocessadores e transferência internacional nos termos/conta Cloudflare; se o escritório exigir localidade brasileira, usar origin/DB/storage em região brasileira com Cloudflare na borda ou manter dados pessoais/documentos fora do Cloudflare até aprovação formal. Não tratar criptografia como substituto automático de requisito de transferência/localidade.
- Cada database é single-threaded, enfileira queries e pode retornar overloaded; throughput depende da duração/quantidade de queries. D1 suporta replicação de leitura, mas isso não remove fila/limite de escrita do database principal.
- D1 é SQLite e tem particularidades/limites de SQL; testar integridade referencial, concorrência, migração, índice, exportação/restore e comportamento remoto. Não guardar grandes docs, vetores binários, transcrições ilimitadas ou grandes tabelas de julgados dentro de D1.
- Uma base por ambiente no MVP (local/staging/prod), `tenant_id` em cada tabela e tenant aplicado na camada de repositório/API. Quando SaaS crescer, avaliar database por escritório para isolamento ou particionamento, desde que custo operacional e bindings sejam viáveis.
- Manter adapter/repositories e export schema/CSV/JSON/SQL para permitir migração. Gatilhos de reavaliar: database aproximando 70% do limite (meta de alerta), projeção de crescimento incompatível, overload em tráfego normal, p95 de query ultrapassando SLO, necessidade de transação/consultas avançadas, região/backup contratual não atendidos ou avaliação de segurança não aprovada. Qualquer migração precisa ensaio com snapshot, cutover, verificação de contagem/hash e plano de rollback.
- D1 Time Travel e backups do plano não substituem exportação própria nem teste de restore. Criar e ensaiar procedimento de recuperação antes dos dados de cliente.

### Gate de localização/transferência antes de dados reais

Cloudflare documenta data-at-rest locations e criptografia, mas a pessoa responsável precisa avaliar a transferência internacional, finalidade, base legal, cláusulas/garantias, transparência ao titular, subprocessadores e compromisso de sigilo aplicável ao escritório. A [Resolução CD/ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024) estabelece mecanismos de transferência internacional (incluindo cláusulas-padrão contratuais e decisões de adequação). Não presumir que um DPA genérico estrangeiro já satisfaz o mecanismo brasileiro. Até validar contrato/escopo/localidade, ambientes têm dados sintéticos; nenhum documento ou dado identificável real entra em D1/R2/AI Search.

## 3. Monorepo TypeScript atual

```text
src/               # Site Vite/React público; continua no root e no fluxo Pages
apps/
  mobile/          # Expo Router; iOS, Android e web do produto autenticado
  api/             # Cloudflare Worker; auth, REST, webhooks e cron por etapas
packages/
  contracts/       # Schemas Zod e tipos compartilháveis atuais
  db/              # futura extração de migrations/repositórios se o uso justificar
  domain/          # futura camada de regras puras; prazo nunca fechado por IA
  integrations/    # futuros adapters de tribunal, DJEN, Drive, assinatura e social
  skills/          # registry futuro de capacidades tipadas no produto
  design-tokens/   # tokens compartilhados após a experiência estabilizar
docs/
  plano/           # pesquisa, arquitetura, ADRs e próximos passos
  adr/             # decisões de arquitetura com validação e ressalvas
```

Usar pnpm workspace com lockfile único e checks compartilhados. O workspace já contém `apps/mobile`, `apps/api` e `packages/contracts`; o workflow Pages segue separado e o site institucional não foi movido. Não publicar cliente/processo/segredo no Pages público.

## 4. Modelo de domínio inicial

Entidades candidatas (refinar com Márcia): `Tenant`, `User`, `Membership`, `Client`, `Matter/Process`, `Court`, `ProcessEvent`, `Publication`, `NotificationDelivery`, `Task`, `DeadlineCandidate`, `Hearing`, `Note`, `DocumentReference`, `DriveConnection`, `SignatureEnvelope`, `FinancialEntry`, `PaymentInstallment`, `AuditEvent`, `IntegrationSecretRef`, `SavedResearch`, `PrecedentReference`, `ChatConversation`, `ChatCitation`, `SkillDefinition`, `SkillRun`.

Todo registro que traz evidência externa inclui `sourceProvider`, `sourceUrl`, `sourceRecordId`, `observedAt`, `occurredAt`/`publishedAt`, `payloadHash`, `lastCheckedAt`, `state` e campos de confiança/checagem necessários. PII/documentos separam metadados mínimos do objeto R2; cada registro tem `tenantId`, e os processos/documentos podem ter ACL `matterId` quando houver equipe.

Money stored as integer centavos or decimal string with currency; dates include timezone and preserve source date. Regras de prazo recebem tribunal, calendário/feriados, data de publicação/ciência, fonte, dias úteis e revisão — no cálculo automatizado na primeira fase; após eventual motor determinístico, versionar regra e sempre apresentar memória de cálculo/revisão humana. Nada de usar ponto flutuante para dinheiro.

## 5. Chat IA para jurisprudência e escritório

### Respostas em etapas

1. **Busca pública de jurisprudência:** pergunta contextual → clarificar fatos/questão/UF → buscar provedores/fontes oficiais permitidos → rerank de autoridade e aderência → resposta com citações/trechos → abrir original → salvar pesquisa. O primeiro release usa provider API/link oficial, não corpus ilegalmente copiado.
2. **Conhecimento do escritório:** depois de consentimento e modelagem de permissões, recuperar documento/processo/nota escolhidos no Drive/R2; a permissão é avaliada antes da busca e antes da resposta. Respostas separam: “jurisprudência pública” e “documento interno”.
3. **Ações via chat (futuro):** sugerir tarefa/nota/lançamento/seleção de documento; mostrar preview completo e pedir confirmação explícita antes de gravar. Somente ferramentas permitidas pelo perfil.

### Pipeline RAG

- Ingestão via provider autorizado → validar tipo/tamanho/malware → OCR/parse com logs de falha → reduzir dados pessoais → chunk com offsets e fonte → hash/versionamento → embeddings → indexar com metadados de tenant, matter ACL, fonte, tribunal, datas, tipo, nível de sigilo e `documentVersion`.
- Consulta: autenticar usuário → coletar organizações/casos permitidos → filtrar corpus antes do retrieval → busca lexical + vetorial, filtros por autoridade/tribunal/data/tipo → reranker opcional → retirar duplicatas e conflitos → fornecer apenas trechos necessários ao modelo → validar citação que a resposta aponta para trecho real → registrar metadados mínimos.
- A resposta tem frase + citationId, texto literal curto, página/parágrafo, link, tribunal, número, relator, publicação/julgamento, fonte/licença, data de consulta e indicador de “não verificado quanto à atualidade/força”. Para cada afirmação jurídica factual deve haver referência. Se a fonte não sustenta a resposta, não improvisar.
- Separar prova (texto da fonte) de inferência do modelo. Pode citar argumento divergente, distinguishing, decisão posterior/estado desconhecido e não-conclusividade. Checar precedente qualificado na fonte oficial antes de marcá-lo vinculante.
- Não usar documentos sensíveis como contexto do modelo, telemetria ou exemplos sem base legal/consentimento e contrato de processamento adequados. Não enviar conteúdo de Drive para modelo externo por padrão.
- Sem cache cruzado de respostas privadas. Não persistir prompts completos em AI Gateway/observability; reduzir logs a request ID, provider, modelo, tokens, custo/duração e estado sem payload. Retenção de conversa configurável e exclusão que invalida chunks/embeddings.
- Defesa contra prompt injection em PDF/Drive: tratar documento como dado não confiável; instruções embutidas não podem elevar privilégios nem disparar ferramenta; ferramentas executam validação de schema, tenant, autorização e confirmação no backend.
- Avaliação antes de liberar: conjunto sintético/julgados públicos licenciados, aprovado por advogada; medir Recall@k de precedentes, precisão de citações, taxa de claims sem suporte (meta zero para citações inválidas), falsos “precedente vinculante”, cobertura de entendimento contrário e latência/custo. Revisar regressões em cada troca de modelo/indexer.

### AI Search ou Vectorize

- **AI Search gerenciado:** acelerar protótipo de RAG com R2, indexação e exemplos oficiais de citações; docs suportam filtro de tenant e instância por tenant (recomendada para separação forte) e ação humana para aprovar alterações no knowledge base. Seus endpoints públicos podem ficar sem autenticação; não expor corpus do escritório publicamente, chamar via Worker autenticado e confirmar que proteção Access/autorização respeita usuário e processo. Validar configuração de prompt/log, limites, região, versionamento e suporte a ACL por processo/cliente antes de usar conteúdo real.
- **Vectorize + retrieval próprio:** maior controle de ACL, ranking específico jurídico, observabilidade redigida, lifecycle/expurgo e citations; demanda implementar ingest/retrieval/reranking/eval.
- Fazer prova comparativa com corpus público autorizado e docs sintéticos. Decidir por ADR com custo, desempenho, isolamento, explicabilidade, delete, fonte e facilidade para Márcia. Não selecionar só pela demo mais bonita.

## 6. Skills e configuração de novas capacidades

Existem dois conceitos diferentes e ambos são documentados: **skills de agente de desenvolvimento** (instruções reutilizáveis do Codex/Claude em `.agents/skills`/`.claude/skills`) e **skills dentro do produto** (ações e assistentes que Márcia habilita no app). Não misturar arquivos que orientam ferramentas de coding com lógica executada no SaaS.

### Produto — registry seguro

Cada capacidade é um pacote/manifest com: `id`, versão, nome/descrição em linguagem de usuária, categoria, status, JSON/Zod input/output schema, ferramentas autorizadas, dados necessários, escopo/permissions, limites de custo/uso, conectores requeridos, efeito (somente leitura ou escrita), requisito de confirmação, timeout/retry, fallback determinístico, audit fields, evals e owner.

Fluxo: descobrir → ler explicação/exemplos/permissões/custo → conectar fonte se necessária → testar com exemplo fictício → habilitar → observar execução → desabilitar/revogar/exportar. Defaults são read-only. Cada alteração de habilidade tem versionamento e rollback. Capability keys seguem allowlist; modelo não fornece nome de método nem query SQL arbitrária.

Template dev `pnpm gen:skill <slug>` (a implementar) cria manifest, service, schemas, UI stub, unit/E2E/AI evals e docs. Check de contrato garante que schemas e permissões batem. Skills declarativas aprovadas podem ser ajustadas por pessoa admin; código/plugin arbitrário executável por usuário fica fora do MVP e requer sandbox isolado/revisão de segurança.

Exemplos de primeiras skills: “Resumo das prioridades de hoje” (read-only), “Preparar pauta de audiência” (read-only + citations), “Pesquisar julgados de uma questão” (read-only com fontes), “Criar tarefa a partir de publicação revisada” (propose-then-confirm), “Registrar recebimento” (write only after confirmation).

## 7. Configuração de Google/Microsoft no produto

### UX de configuração (não pedir sigla ao usuário final)

Tela **Configurações → Integrações → Arquivos** com cartões Google Drive e Microsoft OneDrive/SharePoint: botão “Conectar”; status e nome da conta; explicação de quais arquivos a aplicação acessa; seletor do arquivo/pasta; modo leitura; última sincronização e motivo do erro; escopos/permissões; atualizar conexão; desconectar e apagar índice. Atalho “Como conectar sua conta corporativa?” com redirect URI copiável e passos de app OAuth.

Tela de administração do deployment aceita a configuração no formato correto: Google API Key do Picker (campo opcional, com checklist de restrição de origem e APIs), Google OAuth Client ID/redirect e fluxo OAuth; Microsoft Application Client ID/tenant e fluxo OAuth; secret/certificado somente se o fluxo server-side precisar. Google API Key serve para Picker/projeto/quotas, mas **não concede acesso privado ao Drive**; é pública no cliente e precisa ser restringida. Microsoft Graph usa OAuth/Entra, não uma “API key”. A interface deve mostrar campos por provedor em passos, redirect URI copiável, botão “Testar” e estado de conexão; não apresentar uma caixa de senha genérica que parece compatível com tudo. Registrar quem alterou e quando, nunca valor. Não mostrar “copiar secret” depois de salvo.

**Contrato de implementação da tela de credenciais:** separar `Configuração do app` (Client ID, tenant, redirect URI e API key pública do Picker) de `Conectar conta` (OAuth da pessoa com consentimento explícito). Client secret/certificado é campo somente para owner/admin de deployment, com envio HTTPS diretamente à API autenticada, CSRF protection, step-up/MFA, rate limit e confirmação de rotação; o browser nunca recebe o valor salvo nem é autorizado a chamar Cloudflare Account API. API key do Picker pode aparecer no navegador somente com restrição de origem/API e aviso de que identifica projeto/quotas. Mostrar validação sintática e botão “Verificar configuração”; isso só verifica credenciais/projeto, não declara que conta externa foi conectada. Estados distintos: `não configurado`, `configuração inválida`, `aguardando consentimento`, `conectado`, `token expirado/revogado`, `erro/retentativa`. Oferecer remover/rotacionar credenciais e revogar OAuth separadamente. Se a configuração de segredo precisar de deploy/Cloudflare Dashboard, entregar instruções copiáveis sem coletar o token global da conta Cloudflare no app.

Tokens OAuth por pessoa e consentimento ficam cifrados e revogáveis. Redirect URI exato, PKCE onde aplicável, state/nonce, proteção CSRF, renovação, rotação, expiração, least privilege e scopes revisáveis. Não guardar access/refresh token em localStorage, analytics, logs, screenshots ou GitHub Actions artifacts.

Tokens OAuth de usuárias são credenciais de dados do produto, com ciclo de vida e autorização por pessoa; não são o mesmo que segredo de deploy do Worker. Nunca encaminhar token/segredo da usuária ao browser após callback nem registrar em traces. Secret Store pode guardar segredos operacionais do deployment, mas não resolve sozinho cifra, busca, rotação, isolamento e revogação de tokens por usuário.

### Gate de ativação e garantia de “deve funcionar”

Integração não está concluída por ter botão de conexão. Definition of Done precisa provar com contas de teste/consentidas: OAuth roundtrip, selecionar arquivo, indexar, achar conteúdo permitido no chat com citação a arquivo/página, sincronizar alteração/renomeação/exclusão, respeitar revogação, tratar token expirado, falha de webhook/reconciliação, desligar e apagar índices, sem expor segredo em logs/browser. APIs e app review precisam estar aprovadas para production OAuth.

Estado em 17/11/2026: desenho e critérios somente; não há integração Google/Microsoft ativa, credenciais provisionadas ou consentimento real registrado. O roteiro de pesquisa/ativação, dependências externas e fontes primárias estão em [02 — Pesquisa e evidências](02_PESQUISA_EVIDENCIAS.md). A tela é considerada pronta somente quando o owner consegue configurar Client ID/tenant/redirect com diagnóstico claro, a usuária conecta e revoga sua conta, e a revisão de segurança comprova que nenhum secret/token aparece em resposta, bundle, storage do browser, analytics ou log.
