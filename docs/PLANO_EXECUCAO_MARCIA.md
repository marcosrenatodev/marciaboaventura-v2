# Plano mestre — Márcia | plataforma jurídica rápida, simples e confiável

> **Leia primeiro.** Este é o índice mestre e o ponto único de retomada para humanos, Claude e Codex. A execução não deve recomeçar do zero: consulte “Estado e próxima ação”, escolha o documento relacionado à tarefa e continue pelo primeiro item aberto. O plano separa fatos verificados, decisões provisórias e perguntas que dependem de Márcia.
>
> **Última revisão:** 17/11/2026. Pesquisas sobre produtos, preços, APIs e normas mudam; confira novamente as fontes primárias antes de contratar ou implementar uma integração.

## Visão do produto

Construir, primeiro para Márcia e depois com potencial de virar uma plataforma jurídica global, o aplicativo jurídico mais fácil de usar no dia a dia: rápido no celular e no computador, simples de configurar, confiável nos dados e extensível sem reconstruir o núcleo. A ambição “o melhor app de todos os tempos” vira metas verificáveis de usabilidade, desempenho, confiança, segurança, integração e aprendizado contínuo. Não declarar que o produto domina o mercado sem evidência.

Uma experiência única deve ajudar a advogada a abrir o app e entender, em segundos: **o que exige atenção hoje, por quê, qual é a fonte, qual é o próximo passo e se alguém precisa confirmar algo**. O sistema organiza trabalho; a advogada mantém o controle de decisões, prazos, comunicações e assinatura.

## Requisitos confirmados pelo usuário

- Evoluir o projeto React existente de Márcia Boaventura, advogada, usando os exemplos em `~/Downloads/arquivos.zip` e `~/Downloads/anexos (1).zip` apenas para entender fluxos; dados reais dos arquivos não entram no protótipo nem nos repositórios.
- Fazer um MVP útil e simples, inspirado em padrões de gestão do Astrea sem copiar sua interface; priorizar TJPR, TJSC, TJRS e TRF4, com arquitetura preparada para Brasil inteiro.
- Preferir TypeScript de ponta a ponta; preferir Cloudflare e seus serviços porque o usuário já tem conta. **D1 é a primeira opção de banco no lugar de PostgreSQL**, condicionada aos limites e requisitos descritos no plano.
- Criar experiência web responsiva e apps nativos para Android/iOS; pesquisa E2E em todas as plataformas quando a implementação permitir. O host atual é Linux e não consegue compilar/testar iOS localmente: planejar runner macOS na CI.
- Acompanhar processos e investigar robustamente intimações/publicações oficiais e provedores SaaS; pesquisar jurisprudência e facilitar achar precedentes relevantes e confiáveis.
- Preparar chat de IA para perguntas sobre jurisprudência e, após revisão de segurança, documentos e dados autorizados do escritório; integrar Google Drive e Microsoft OneDrive/SharePoint.
- A tela de integrações deve tornar Google e Microsoft configuráveis e funcionais. Usar credenciais/OAuth corretamente: uma API key sozinha não abre arquivos privados; não enviar segredos ao frontend. Explicar isso em linguagem simples na configuração.
- Assinar documentos eletronicamente por provedor integrado; manter clara a diferença entre contratos/autorizações e assinatura exigida para protocolo judicial.
- Facilitar criação, revisão e compartilhamento de conteúdo em Facebook, Instagram e TikTok e apoiar tráfego pago sem violar regras de publicidade da advocacia.
- Organizar arquivos com `AGENTS.md` e `CLAUDE.md` legíveis, CI visível no GitHub e práticas de trabalho para IA e pessoas.
- O usuário pediu pesquisa profunda antes da execução, registro completo e continuidade se o contexto/tokens acabarem. “Esgotar a internet” é tratado como pesquisa extensiva e rastreável em fontes primárias relevantes, não como promessa impossível de ler toda a internet.

> Os itens acima são objetivos desejados para a plataforma completa; **não significam que tudo entra no primeiro MVP**. A sequência abaixo começa por um fluxo pequeno validável por Márcia, sem perder os compromissos de arquitetura nativa, Cloudflare, integrações e testes para as etapas seguintes. “Financeiro simples” é requisito do produto, mas a profundidade (parcelas, categorias, despesas e relatórios) ainda depende de conversa com Márcia; os ZIPs dão evidência principalmente para honorários.

## Decisão de organização do código

O site institucional atual permanece no root, público e deployado separadamente. O produto será iniciado no mesmo repositório Git, como monorepo TypeScript com aplicações isoladas (`apps/mobile` para Expo, `apps/api` para Workers) e contratos compartilhados em `packages/contracts`. Não converter a landing page pública em área autenticada. Compartilhar identidade visual e tipos quando fizer sentido; dados, credenciais e pipelines de deploy permanecem separados.

## Princípios que não podem se perder

1. **Facilidade antes de quantidade de recursos.** Resolver tarefas diárias em poucos passos; começar pela rotina real de Márcia, não por uma lista genérica de funcionalidades.
2. **Confiança visível.** Cada dado externo apresenta fonte, momento da consulta, cobertura e estado; falha ou ausência de retorno nunca se transforma em “nada aconteceu”.
3. **Humano no controle jurídico.** IA pode localizar, organizar e explicar evidências com citações; não confirma prazo, não conclui estratégia, não protocola, não reconhece citação/intimação e não assina sem ação humana explícita.
4. **Privacidade desde o desenho.** Segredo profissional, LGPD, acesso mínimo, isolamento por escritório, auditoria, exclusão/exportação, retenção definida e dados sintéticos em desenvolvimento e CI.
5. **Proveniência acima de resumos.** Mostrar documento/trecho original, tribunal, classe, datas, resultado, fonte e link; apontar entendimento contrário e limites da cobertura. Não inventar ementa, tese, citação ou atualidade.
6. **Integrações substituíveis.** Adaptadores versionados para tribunais, pesquisa, armazenamento, assinatura e modelos; o núcleo não depende de uma API proprietária.
7. **Mobile de verdade.** Android/iOS nativos, operação adequada a uma mão, alvos grandes, navegação previsível, offline para rascunhos autorizados e sincronização explícita.
8. **Simplicidade operacional.** Configuração guiada, verificação de conexão, diagnóstico em linguagem simples, limites/custos legíveis e botão para revogar acesso.
9. **AI + pessoas.** Agentes recebem objetivo, escopo de arquivos, formato de saída, evidência e checks; trabalho concorrente é isolado, revisado por humano e integrado pelo responsável do projeto.

## Arquivos do plano

- [01 — Produto, UX e roadmap](plano/01_PRODUTO_UX_ROADMAP.md): promessa do produto, módulos, ordem de entrega, ergonomia, metas de usabilidade e critérios de saída.
- [02 — Pesquisa, fontes e decisões](plano/02_PESQUISA_EVIDENCIAS.md): Astrea, tribunais, notificações, jurisprudência/Jusbrasil, OAB, assinatura e integração com drives, com links e ressalvas.
- [03 — Arquitetura, IA e Cloudflare](plano/03_ARQUITETURA_IA_CLOUDFLARE.md): TypeScript, D1/R2/Workers, busca/chat com citações, conectores e sistema de habilidades extensível.
- [04 — Segurança, CI, testes e operação](plano/04_SEGURANCA_CI_TESTES_OPERACAO.md): proteção de dados, CI no GitHub, E2E Android/iOS/web, observabilidade, recuperação e processo de release.
- [05 — Modelo de domínio do MVP](plano/05_MODELO_DOMINIO_MVP.md): entidades D1 e contratos para processos, tarefas, agenda e financeiro, com isolamento e aceite sintético.
- [06 — Credenciais e acesso judicial](plano/06_CREDENCIAIS_E_ACESSO_JUDICIAL.md): separa acesso da advogada, API pública, credencial institucional, integração do Domicílio e acesso aos sistemas locais.
- [Índice de documentação](README.md): mapa do repositório e documentos de continuidade.

## Estado e próxima ação

### Estado conhecido do repositório

- Projeto atual em `~/Projects/marciaboaventura-v2`: o site institucional original continua em Vite + React + TypeScript + Tailwind/shadcn; os fluxos da plataforma foram separados em app/API próprios.
- `src/` preserva a landing pública e identidade marsala/dourado/creme; `/escritorio` é demonstração claramente marcada e usa dados fictícios. O app não substitui nem publica dados no site público.
- `.github/workflows/pages.yml` continua implantando só `dist` do site institucional em GitHub Pages. `.github/workflows/ci.yml` e `native-e2e.yml` não implantam app nem API.
- Workspace pnpm contém `apps/mobile`, `apps/api` e `packages/contracts`. Expo/React Native Web entrega o mesmo app em web, Android e iOS; API é Cloudflare Worker com D1 e Better Auth. `.node-version` fixa Node 22.14.0 e `packageManager` pnpm 10.27.0; JDK 17 e Android SDK 36 estão definidos para build nativo.
- ZIPs inventariados sem copiar dados: exemplos mostram clientes, processos, prazos, audiências, petições/contratos, movimentações e honorários. Os documentos pedem importação por número, captura de publicações/andamentos e buscas automatizadas nos tribunais/diários, mas não identificam DataJud, DJEN, uma API gratuita, credencial, licença ou autorização; as fontes oficiais específicas estão pesquisadas em [02](plano/02_PESQUISA_EVIDENCIAS.md#integração-oficial-gratuita-x-contratação-de-saas) e [06](plano/06_CREDENCIAIS_E_ACESSO_JUDICIAL.md).
- O app tem login/setup do primeiro owner, isolamento por escritório e gravação/leitura persistente na API/D1 local para assuntos, processos manuais, tarefas, compromissos, receitas/despesas básicas e buscas jurídicas guiadas. Abre a fonte oficial TJPR/TJSC/TJRS/TRF4/STJ/STF, sem coletar decisões; não consulta tribunais de processos nem sincroniza prazos/publicações. Não há provedores externos conectados.
- CI implementada: lint/test/build do site, contratos/API/mobile, export web, Playwright desktop Chromium + mobile Chromium + WebKit no CI, e workflow nativo para a mesma jornada completa Android/iOS. Ações são fixadas por SHA, com Dependabot semanal e permissões mínimas. PR draft #1 já iniciou os runs remotos. O run nativo `44081484461` (commit remoto `6215335`) compilou e lançou iOS/Android e iniciou a jornada Maestro em ambos; Android falhou ao verificar que a linha de vencimento financeira estava visível, e iOS falhou ao localizar o título inicial “Bem-vinda”. O ajuste Android de rolagem está em `d592215` local; o iOS recebe `testID` estável e captura de tela + OCR/logs de runtime no próximo run. A nova CI web `44088934962` do commit remoto `767e329` passou todos os checks, inclusive o Playwright renderizado. A repetição nativa `44088935178` está compilando Android/iOS; ainda não há resultado da jornada na versão corrigida.

### Situação da execução

- [x] Projeto e amostras inventariados; limites de sensibilidade registrados.
- [x] Primeira rodada de pesquisa oficial/fornecedores para Cloudflare, jurisprudência, notificações, Google/Microsoft e assinatura realizada.
- [x] Mudança de PostgreSQL para Cloudflare D1 como preferência registrada, com limites técnicos e gatilho de migração.
- [x] Instruções raiz e por pasta adicionadas/planejadas para leitura de Claude/Codex sem cópia integral redundante.
- [x] Revisão crítica dos três agentes concluída e consolidada; corrigidos link da Pesquisa Pronta, nuances Swagger DJEN vs envio por tribunal, assinatura em peticionamento e runtime. Escopo continua faseado, preservando os objetivos gerais que o usuário solicitou.
- [x] Pesquisa de ergonomia registrada com recomendações Apple/WCAG, heurísticas de usabilidade e critérios de observação com Márcia.
- [x] Protótipo navegável inicial iniciado em `/escritorio`: áreas Hoje, Processos, Agenda, Financeiro e Pesquisa; ações locais com dados fictícios, estados e aviso persistente de demonstração.
- [x] Verificação local final em 17/11: `pnpm lint`, `pnpm test`, `pnpm build`, typechecks de contracts/API/mobile/E2E, export web Expo, `pnpm --filter @marcia/api build` (Wrangler dry-run) e `git diff --check` passaram. ESLint termina com 15 avisos Fast Refresh (zero erros); Vite reporta `caniuse-lite` antigo e chunk principal de 516 kB; o export Expo tem entry de 1,1 MB e pesquisa de 555 kB. Medir e reduzir bundles antes da produção.
- [x] Preservados o site público e o deploy GitHub Pages em workflow separado; o workspace legal roda em `apps/*` e não modifica o produto público por deploy próprio.
- [x] Implementados Better Auth, bootstrap fechado do primeiro owner e API/D1 com dados persistentes de escritório: assuntos, processos manuais, tarefas e receitas/despesas simples, sob isolamento de tenant.
- [x] Web renderizada e E2E Playwright passou em 17/11: 3/3 (Chromium desktop, Chromium mobile e site público + `/escritorio`). A jornada cria processo, tarefa, compromisso, receita/despesa, datas vencidas/hoje/futuras, muda estados, pesquisa TRF4, verifica persistência e sessão/tenant, captura screenshots e confirma ausência de overflow em viewports desktop/tablet/celular. O projeto WebKit está configurado no CI, mas o binário não roda neste Ubuntu 20.04 local.
- [ ] Android: no run hospedado `44081484461`, o fluxo passou onboarding, assunto/processo, agenda, formulário e gravação financeira e falhou ao não encontrar “Vence em 01/01/2030” visível. Foram adicionadas duas rolagens após salvar o lançamento em `d592215`; aguarda novo run antes de marcar Android como aprovado. O teste local também continua limitado pelo host sem `/dev/kvm` e ANR do System UI.
- [x] APK development/debug Android foi compilado após o prebuild Expo: `apps/mobile/android/gradlew -p apps/mobile/android assembleDebug --no-daemon` terminou com `BUILD SUCCESSFUL` (17/11; 11m17s). O artefato local de 255 MB é universal para desenvolvimento, não é pacote de distribuição; AAB/release otimizado, assinatura e medição de tamanho continuam pendentes.
- [x] `pnpm --filter @marcia/api build` concluiu `wrangler deploy --dry-run` (Worker 2.48 MB / 413.83 KiB gzip, vínculo D1 local somente). Workflows e YAML Maestro passaram validação sintática. Nenhum deploy foi feito.
- [ ] iOS: no run hospedado `44081484461`, prebuild, instalação, servidor Expo e abertura do app passaram; o Maestro falhou na primeira asserção do título “Bem-vinda”. Acrescentamos seletor `testID` acessível e captura OCR de screenshot + logs no próximo run; identificar a tela atual e corrigir a causa, sem considerar build/launch como jornada validada.
- [x] Workflows GitHub CI, E2E nativo e Pages revisados: Actions fixadas por SHA, permissões mínimas, timeouts/concurrency, artifacts de teste com retenção curta, Dependabot semanal e instalação frozen-lockfile. O PR draft #1 já está ativo e rodando CI. Pages continua publicando somente o site público em push a `main`.
- [ ] Fazer revisão presencial de ergonomia e terminologia com Márcia; validar leitor de tela, zoom, teclado/safe areas e telas pequenas em dispositivos reais.
- [ ] Enviar para o branch do PR draft #1 os commits locais de relatório, fluxo Android, seletor/diagnóstico iOS e pesquisa de fontes oficiais gratuitas; senha/token do setup agora são aleatórios e mascarados por execução. A primeira tentativa de enviar o fluxo com credenciais de teste fixas foi barrada pela revisão automática do GitHub; o fluxo foi corrigido para não conter esses valores. Acompanhar novos runs de `ci.yml` e `native-e2e.yml`, corrigir falhas até confirmar WebKit, Android e iOS. Depois configurar branch protection/checks obrigatórios no repositório.
- [ ] Obter revisão de segurança/privacidade e validar migração/restore/monitoramento antes de qualquer dado real ou deploy da API.
- [ ] Validar com Márcia se o fluxo atende a rotina real e ajustar campos, vocabulário e prioridade (financeiro, processos, agenda).
- [ ] Confirmar trilha de deploy privado Cloudflare (ambientes, D1 migrations, R2/backups, logs, recuperação/expurgo e segredos) antes de dados reais.
- [ ] Implementar por etapas conectores próprios para fontes oficiais (DataJud/DJEN e feeds dos tribunais quando disponíveis), depois OAuth Google/Microsoft, assinatura, IA/RAG e social. Antes de uso de DataJud em produção, obter clareza escrita sobre os termos aplicáveis; solicitar a rota do Data Lake apenas se a cobertura/uso justificar seus requisitos e custeio. SaaS de processos/jurisprudência é opcional para lacunas de cobertura, atualidade, SLA ou licença, não pré-requisito do produto. Nenhum conector externo está ativo neste MVP.
- [ ] Revisar CRUD de edição/exclusão, acessibilidade, recuperação de conta, controles operacionais e hardening da autenticação antes do piloto.

### Próxima ação concreta para continuar

1. Ler `AGENTS.md`, este arquivo e `docs/plano/04_SEGURANCA_CI_TESTES_OPERACAO.md`; conferir `git status` antes de alterar.
2. Os checks locais já passaram: lint/test/build, typechecks, export Expo, API dry-run, YAML; após o fix, `pnpm typecheck:e2e` e `pnpm e2e:web` (3/3 Chromium desktop/mobile + site público). Para abrir servidores locais E2E neste ambiente foi necessária permissão de rede local; não houve publicação nem acesso a dados externos.
3. Enviar para o branch do PR #1 os commits locais atuais (veja `git log`) criando um commit sobre a cabeça remota, preservar o SHA esperado e conferir o PR; acompanhar o novo CI/native E2E. O job anterior `44081484461` reproduz duas falhas de UI específicas, descritas acima; usar os novos screenshot/OCR/logs para iterar em iOS e a nova rolagem para Android.
4. Revisar relatório, screenshots e estado final dos checks em GitHub; atualizar este plano com IDs, SHA e resultados reais. Não mesclar nem usar Pages para publicar o app: o workflow Pages só publica o site institucional em `main`.
5. Fazer walkthrough com Márcia e um dispositivo iOS/Android real; observar 375/768/1440 px, teclado, zoom, leitor de tela, safe areas e vocabulário, usando dados fictícios.
6. Antes de piloto privado: revisão de segurança/privacidade, recovery, migrações/restore, segredos, acessibilidade e operação. Para processos, provar primeiro leitura do DataJud/DJEN; obter orientação escrita do CNJ sobre o uso do DataJud no software interno remunerado e validar host/termos de produção do DJEN. Só solicitar API institucional do Domicílio/Data Lake depois de confirmar elegibilidade, escopo, custo e credenciais do CNPJ. Nunca colocar gov.br, e-CPF ou certificado pessoal de Márcia no app; acesso a conteúdo do Domicílio exige ação humana explícita e auditada. Não usar dados reais nem publicar até passar esses gates.
7. Ao parar, atualizar este estado com o que realmente rodou, erros, arquivos tocados e próximo comando literal.

## Registro de decisões e perguntas abertas

### Decisões atuais

- TypeScript em frontend, API, esquemas e conectores; React do site existente é reaproveitado como marketing, e Expo/React Native + Expo Router é candidato para app universal/nativo, sujeito a spike e decisão de UX.
- Cloudflare Workers/Pages, D1 (SQLite gerenciado), R2 para documentos e Queue/Workflows para integrações assíncronas são a arquitetura candidata. D1 é adequado como primeira etapa de escritório pequeno se a carga e modelo couberem: limite atual duro de 10 GB por banco e processamento single-threaded por banco. Guardar documentos fora de D1; manter exportação e caminho de migração.
- Cloudflare AI Search com instância isolada por escritório ou Vectorize com filtros de tenant são candidatos para RAG; nada de indexar dados reais até validar contratos, permissões, logs, retenção, acesso e exclusão.
- Autenticação candidata da primeira fatia: Better Auth 1.7.25, D1 nativo e plugin Expo, sujeito a prova local de sessão/cookies, migrations, bootstrap owner one-shot, rate limiting e isolamento antes de qualquer deploy/dado real; detalhes/fontes em [Pesquisa e evidências](plano/02_PESQUISA_EVIDENCIAS.md).
- Acompanhamento de processos: **não contratar SaaS como pré-requisito do MVP**. Primeiro, oferecer à Márcia um atalho para o Jus.br, que reúne comunicações do DJEN e do Domicílio e usa seu acesso profissional (certificado digital ou gov.br ouro); isso não dá ao app API nem direito de guardar a sessão dela. Construir adapters próprios para GETs públicos do DJEN (depois de provar consulta em produção) e DataJud (após clarear os termos de uso interno), além de links/alertas gratuitos dos portais oficiais; priorizar TJPR/TJSC/TJRS/TRF4. O DataJud não cobra assinatura de SaaS, mas os termos atuais restringem uso comercial/distribuição; confirmação escrita é gate de produção. DJEN cobre publicações, não todos os andamentos nem Domicílio. Portais e e-mails/push nativos variam por tribunal (p.ex. TJSC eproc notifica eventos com prazo por e-mail se a advogada estiver vinculada; TRF4 mantém push separado). A Portaria CNJ 316/2024 prevê lista diária de processos públicos modificados, cuja URL/formato ainda falta localizar. A API central do Data Lake requer autorização e pode ter custeio para entidades privadas. Fornecedor SaaS fica como fallback apenas para lacuna comprovada; fonte, última consulta/atraso e revisão humana de prazos são obrigatórios. Matriz e estratégia: [02](plano/02_PESQUISA_EVIDENCIAS.md#integração-oficial-gratuita-x-contratação-de-saas) e [06](plano/06_CREDENCIAIS_E_ACESSO_JUDICIAL.md).
- Jurisprudência: busca oficial gratuita/guiada e links para STJ/TRF4/TJs conforme disponibilidade; ainda não há evidência de API pública de jurisprudência dos tribunais-alvo. API licenciada de BuscaProcessos/Jusbrasil só entra se estudo de cobertura, licença, preço e redistribuição mostrar lacuna que justifique custo. Não raspar sites nem reutilizar conteúdo sem licença.
- Google Drive: selecionar arquivos com Google Picker e escopo `drive.file` sempre que suficiente. Microsoft: OAuth delegado read-only mínimo viável; permissions selecionadas/SharePoint dependem do tipo de conta/tenant e confirmação. Tokens no backend com revogação.
- Assinatura: adapter a fornecedor como Clicksign API v3, com sandbox, webhook HMAC e validação de contrato/preço/nível necessário. Não guardar chave privada ICP-Brasil no app nem confundir assinatura contratual com assinatura de petição judicial.
- Marketing: exportar conteúdo e abrir share sheet nativo no MVP; postagem direta e anúncios precisam aprovação das APIs e revisão OAB.

### Perguntas para Márcia que não bloqueiam protótipo

- Quais áreas do direito representam a maioria da carteira e quais tribunais/estados aparecem mais?
- O que mais consome tempo hoje: prazos/publicações, encontrar peças/documentos, acompanhar clientes, audiência, cobranças ou lançamento financeiro?
- Quais receitas/despesas, parcelamentos e relatórios realmente usa? Deseja integração bancária agora ou não?
- Quais pastas de Drive/OneDrive podem ser conectadas e a sincronização deve ser só leitura?
- Que documentos precisam assinatura eletrônica, quem assina e qual nível/requisito é exigido por cada ato?
- O conteúdo social promove a advocacia da Márcia, um produto futuro, ou ambos? Default do plano: publicação informativa da advocacia, sob regras OAB.

## Protocolo de continuidade para IA e pessoas

- Antes de tarefa: leia o plano mestre e a seção aplicável; inspecione o código e o estado Git; não confiar só em resumos de conversa.
- Cada tarefa deve declarar resultado esperado, pastas que pode alterar, arquivos de entrada, comandos de validação e restrições de dados.
- Agentes concorrentes não alteram os mesmos arquivos; delegar análise/revisão read-only ou mudanças em módulos isolados. Responsável principal resolve conflitos e integra.
- Pesquisa jurídica/técnica registra URL direta, órgão/fornecedor, data de acesso, afirmação que a fonte sustenta e ressalva. Não atribuir status oficial a material de marketing do fornecedor.
- Todo conteúdo jurídico gerado pela IA inclui fonte e trecho, tribunal e datas; hipótese é rotulada; resultado é revisado por advogada antes de uso externo.
- Nunca usar os dados reais dos ZIPs como fixture, prompt, screenshot, teste, treinamento ou amostra de integração. Usar fixtures sintéticos validados para não conter identificadores plausíveis de clientes reais.
- Após cada tarefa, atualizar “Estado da execução”, checklist e próximo passo. Ao parar, deixar instrução executável para o próximo agente, não “continuar o trabalho”.

## Etapa final obrigatória — renderização e testes end-to-end

Esta etapa fecha o plano e só começa quando os fluxos de produto previstos para a versão candidata estiverem implementados. Não encerrar a entrega com apenas typecheck, lint ou build: abrir a aplicação renderizada em navegador/dispositivo e completar os fluxos como uma usuária faria. Se algum fluxo ou plataforma não estiver pronto, registrar o bloqueio e não declarar a etapa concluída.

### Preparação

- Usar exclusivamente contas, processos, clientes, documentos e lançamentos sintéticos; integrations externas ficam em sandbox ou mock determinístico. Nunca copiar dados dos ZIPs para fixtures, screenshots, traces ou relatórios.
- Subir a aplicação local/preview com configuração documentada e backend D1/local ou API de teste; confirmar health, seed e limpeza do ambiente antes e depois da execução.
- Automatizar Web com Playwright em Chromium; cobrir WebKit/Firefox no smoke compatível. Testar o Expo Web renderizado no browser e, quando aplicável, a área demonstrativa `/escritorio` do site atual sem tocar no fluxo de publicação de Pages.
- Testar Android em emulador com Maestro ou Detox e iOS em simulator/runner macOS com a mesma suíte de jornadas prioritárias. Validar share sheet e capacidades nativas somente em plataforma real/emulador apropriado.

### Renderização e matriz visual

- Abrir a página com resolução desktop de 1440 × 900, tablet de 768 × 1024 e celular de 375 × 812; incluir viewport móvel estreito adicional se houver quebra de conteúdo.
- Registrar screenshots baseline e após execução; confirmar que título, navegação, conteúdo e ações cabem, não há rolagem horizontal acidental, modal/menu não encobrem controles e texto não se sobrepõe.
- Testar navegação por teclado/foco visível, zoom de 200%, estados de carregamento/vazio/erro e pelo menos um leitor de tela em cada família de plataforma antes do aceite. Usar checks automáticos de acessibilidade como apoio, com revisão manual.
- Capturar vídeo/trace/screenshot somente com dados sintéticos; publicar artefatos de falha sanitizados e com retenção curta.

### Jornadas E2E obrigatórias

1. Entrar no ambiente de teste e concluir onboarding/configuração inicial; validar estados de integração conectada, desconectada e erro.
2. Abrir “Hoje”, entender o que requer atenção e navegar até a ficha de processo; buscar por CNJ sintético e por parte fictícia.
3. Revisar uma publicação demonstrativa, conferir fonte/data, criar tarefa e confirmar que nenhum prazo é marcado como confirmado sem ação explícita da advogada.
4. Abrir agenda, consultar audiência sintética e registrar o próximo passo.
5. Lançar receita e despesa fictícias, editar/desfazer um lançamento e confirmar os totais apresentados.
6. Pesquisar jurisprudência, abrir a fonte/citação associada, salvar a pesquisa e verificar estado vazio/indisponível sem resposta inventada.
7. Configurar e testar Drive/OneDrive em sandbox/mocks, escolher um documento e revogar o acesso; executar assinatura só em sandbox e verificar evidência/status.
8. Validar logout, persistência/sincronização autorizada, recuperação após refresh/reabertura e isolamento entre dois tenants sintéticos.
9. Em Android/iOS, repetir os fluxos P0 definidos com Márcia, validar navegação por toque, teclado, deep links, offline/rascunho/sincronização e privacidade de notificações/share sheet quando implementados.

### Fechamento e critério de aceite

- Executar os testes em CI e, antes da entrega, uma rodada visual assistida em navegador e dispositivos/emuladores; anexar relatório com commit, ambientes, versões, comandos, fluxos, screenshots sanitizados, casos aprovados/falhos e limitações.
- Corrigir falhas P0/P1 e repetir a suíte completa. A etapa só passa com todos os fluxos P0 aprovados em Web, Android e iOS; nenhuma falha de isolamento entre tenants; nenhum dado jurídico de produção em artefato; revisão manual dos screenshots e aprovação de Márcia para as jornadas principais.
- Se o runner iOS, conta de sandbox, credencial ou integração não estiver disponível, registrar o item como pendente com responsável e próximo comando concreto. Não substituir teste de fluxo por build/export, nem declarar “E2E em todas as plataformas” baseado apenas em uma plataforma.
