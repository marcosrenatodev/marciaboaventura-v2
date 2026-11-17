# 01 — Produto, experiência e roadmap

## 1. Ambição traduzida em produto

Ser a ferramenta que Márcia abre sem treinamento para responder “o que faço agora?” e concluir o trabalho com segurança. O diferencial a perseguir não é um painel cheio de números: é reduzir a fricção entre processo, intimação, tarefa, documento, cliente, honorários e próximo passo, mantendo a origem de cada informação visível.

### Promessa da primeira versão

“Em um lugar só, vejo o que importa hoje, encontro o processo e documento certo, registro um próximo passo e entendo o que entrou e saiu do escritório.”

### Indicadores de qualidade a medir com Márcia

- Ativação: configuração inicial concluída sem suporte em até 10 minutos (hipótese inicial; validar).
- Fluxo: encontrar processo e registrar tarefa/recebimento em até 30 segundos para a maioria dos casos de teste (meta inicial, não fato).
- Confiança: toda atualização externa mostra a fonte e o horário; toda falha é visível; nenhum prazo passa a “confirmado” automaticamente.
- Usabilidade: cinco tarefas prioritárias concluídas por Márcia sem ajuda; registrar sucesso, tempo, erros, hesitação e fala espontânea; alvo de SUS ≥ 85 depois de iteração, sem transformar score numa substituição da observação.
- Desempenho: meta inicial p75 LCP < 2.5 s em rede móvel e API p95 < 300 ms em leitura local simples; medir em produção sintética e rever com Cloudflare. Não esconder lentidão de provedores externos no número do app.
- Mobile: ações frequentes com uma mão; resposta ao toque imediata; lista e agenda legíveis; rascunhos claramente marcados quando ainda não sincronizados.
- Onboarding: conectar a primeira fonte, registrar o primeiro processo e completar a primeira rotina sem precisar conhecer arquitetura ou API.

Metas são critérios de teste do produto, não afirmações de desempenho já alcançado.

## 2. Usuárias, jornadas e arquitetura de informação

### Usuária inicial

- Márcia, advogada, usuária primária e responsável por conferir atividade jurídica, prazos, documentos, despesas e recebimentos.
- Possíveis clientes/assistente/equipe são personas futuras; não criar permissões ou portal completo antes da necessidade ser observada.

### Home “Hoje”

Ordem recomendada de leitura:

1. Cabeçalho leve: saudação/data e pesquisa universal sempre encontrável.
2. Ação prioritária: prazos/eventos que exigem revisão humana, com contagem e fonte.
3. Agenda do dia e tarefas atrasadas/próximas, sem misturar uma publicação recebida com prazo confirmado.
4. Atualizações recentes da carteira com processo, cliente, origem e horário da consulta.
5. Resumo financeiro compacto (receber, atrasos, despesas próximas), sem dominar a primeira tela.
6. Atalhos “Novo processo”, “Registrar tarefa”, “Lançar recebimento/despesa” e “Perguntar à assistente” conforme frequência observada.

No celular, usar navegação inferior com as áreas mais frequentes (“Hoje”, “Processos”, “Agenda”, “Financeiro”) e botão de ação contextual; pesquisa e perfil ficam fáceis de alcançar. No desktop, navegação lateral persistente, conteúdo central com largura de leitura confortável e painel lateral apenas para detalhes que ajudam a tarefa corrente. Evitar transformar as duas plataformas em layouts miniaturizados um do outro.

### Jornadas MVP

1. **Começar o dia:** abrir Hoje → revisar alertas com origem/estado → abrir processo → registrar providência/tarefa → confirmar conscientemente o próximo prazo.
2. **Localizar processo:** busca por CNJ, parte, etiqueta ou cliente → abrir ficha → conferir tribunal/última atualização/link oficial → registrar nota ou tarefa.
3. **Preparar compromisso:** ver calendário/lista → abrir audiência → abrir processo e instruções → marcar como preparado/concluído.
4. **Lançar financeiro:** escolher cliente/processo opcional → receita/despesa → vencimento/parcelas/estado → confirmação e recibo/nota interna se necessário.
5. **Pesquisar precedente:** descrever questão → receber perguntas de refinamento → filtrar tribunal/data/órgão/classe/força do precedente → comparar argumentos favoráveis e contrários → abrir a fonte primária/inteiro teor → salvar pesquisa com consulta e data.
6. **Conectar documentos:** configurar aplicativo OAuth do escritório → conectar conta com consentimento → escolher pasta/arquivo → mostrar sincronização, erros e revogação.
7. **Assinar contrato:** revisar PDF e signatários → escolher nível/autenticação → pré-visualizar → enviar para assinatura via provedor → acompanhar evento → guardar original, final, evidências e log.

## 3. Regras de ergonomia, hierarquia e simplicidade

Usar pesquisas de tarefa com Márcia para ajustar posição; normas dão um piso, e o comportamento real decide prioridade.

- Colocar conteúdo principal e ação de maior frequência na região central/inferior do celular; ações de navegação devem seguir padrões do iOS/Android. Apple recomenda controles alcançáveis no meio/parte inferior, navegação por gesto padrão e menos controles visíveis de cada vez.
- Alvo confortável de toque de pelo menos 44 × 44 pontos em iOS; usar referência semelhante em Android; no web atender WCAG 2.2 AA (mínimo 24 × 24 CSS px com exceções do critério), preferindo alvos maiores em controles principais.
- Botão principal único por tela/estado. Ações destrutivas, envio, assinatura, exclusão/revogação e confirmação de prazo recebem explicação e confirmação adequada.
- Rótulos em linguagem do escritório, ícone sempre acompanhado de texto ou rótulo acessível em ação crítica; usar siglas só com explicação visível no primeiro uso.
- Mostrar estado do sistema junto ao item: “Atualizado há…”, “Aguardando fonte”, “Falhou — tentar novamente”, “Rascunho neste aparelho”, em vez de toast efêmero como única evidência.
- Preferir reconhecer a lembrar: busca recente, filtros salvos, campos padrões explícitos, histórico, modelos seguros e contexto do processo. Permitir desfazer ação e recuperação de erro.
- Não depender de arrastar; fornecer mover por menu/botões/teclado. Evitar modais em cadeia, formulários longos, campos repetidos e notificações ruidosas.
- Suportar teclado, leitor de tela, Dynamic Type, contraste WCAG AA, zoom/reflow, foco visível, tema claro/escuro e idiomas futuros sem truncar nomes brasileiros ou número CNJ.
- Não usar cor como único estado; diferença visual deve vir com texto, forma/ícone e acessibilidade semântica.

### Como provar que “fácil” está funcionando

- Fazer teste sem tutorial, com cinco tarefas reais representadas por dados fictícios: ver o que vence hoje, localizar um processo, registrar uma providência, lançar um recebimento e encontrar um documento. Observar em celular e computador; não explicar a interface durante a primeira tentativa.
- Registrar conclusão sem ajuda, tempo, toques/cliques, erros, voltas, hesitações e o que Márcia diz que esperava. Perguntar depois “o que você achou que aconteceria?” em ações importantes.
- Alvo inicial: 5/5 tarefas concluídas sem ajuda na rodada final; fluxo frequente em até 3 telas e sem digitação repetida; qualquer erro em ação jurídica crítica bloqueia a rodada. Metas de tempo (por exemplo, localizar processo em até 30 s) servem para comparar iterações e não para apressar decisões.
- Revisar hierarquia com “teste de 5 segundos”: depois de olhar a tela inicial por cinco segundos, Márcia consegue dizer qual item exige atenção, o que está confirmado e qual é a próxima ação?
- Usar nomes e ordem escolhidos por Márcia. “Publicação recebida”, “prazo a conferir” e “prazo confirmado” permanecem estados textuais diferentes; nunca depender só de cores, ícones ou notificações que desaparecem.
- Fazer revisão de alvo/toque em viewport real: controles principais com 44 × 44 pt em iOS, espaço entre ações próximas e conteúdo sem rolagem horizontal. O mínimo WCAG de 24 × 24 CSS px é limite de conformidade em certos casos, não a meta de conforto para os botões mais usados.
- Quando uma seção é rara, manter a ação avançada disponível em “Mais opções” ou na busca, sem ocupar o espaço e a atenção da rotina diária. Nada de colocar assistente de IA, gráficos ou onboarding na frente de um alerta que precisa ser revisado.

## 4. Escopo por ondas

### Onda 0 — Descoberta e protótipo validável

- Conversa curta com Márcia sobre áreas, rotina, nomenclatura, financeiro e dispositivos.
- Protótipo de alta fidelidade navegável com carteira e eventos 100% fictícios, sem login real nem dados externos simulados como oficiais.
- Teste moderado de cinco tarefas com observação e priorização.

### Onda 1 — MVP pessoal utilizável

- **Estado:** fatia local persistente implementada com login/setup one-shot, um owner/escritório, assuntos, processos manuais, tarefas, compromissos, receitas/despesas e consultas de jurisprudência salvas no D1 local. O app abre portais oficiais e ajuda a copiar a consulta; não recolhe decisões automaticamente. Web E2E é validado localmente; Android/iOS compartilham a jornada Maestro e precisam de aprovação CI na versão final.
- Autenticação e tenant estão implementados localmente; avaliação de sessão/revogação completa, MFA, recovery, hardening e configuração de produção continuam pendentes.
- A interface atual cobre Hoje, assuntos/processos manuais, agenda de tarefas/compromissos, financeiro enxuto e pesquisa guiada. Cadastro de cliente separado, notas, calendário mensal e CRUD completo (edição/remoção) ainda não estão completos.
- Financeiro MVP deliberadamente curto: honorários previstos/recebidos e, se Márcia confirmar a rotina, despesas simples; sem nota fiscal, contabilidade, conciliação bancária ou cobrança automática.
- Link para consulta pública oficial e importação/registro manual; origem de cada dado.
- Web responsiva e Worker/D1 persistente em execução local; endpoint/deploy remoto Cloudflare, backup/export/restore e revisão de ambiente seguem bloqueados até o gate de segurança.
- Backup/exportação/restore validados antes de dados reais.

### Onda 2 — Acompanhamento confiável e assinatura

- Provedor autorizado de andamentos/publicações e DJEN; ingestão durável, dedupe, reprocessamento, reconciliação e painel de saúde.
- Separar na UX os alertas públicos do DJEN, Domicílio Judicial (citações/comunicações pessoais) e andamentos de tribunais/provedores; mostrar fonte, última consulta, cobertura conhecida e atraso. Domicílio só entra após confirmar formalmente elegibilidade e autorização; nenhum aviso confirma ciência ou prazo.
- Inbox de publicações com classificação sugestiva, evidência e revisão humana; tarefas só após aprovação.
- Conector de assinatura eletrônica (primeira opção a cotar: Clicksign API v3; manter adapter) e eventos assinados.

### Onda 3 — Pesquisa jurídica assistida + Drives

- Busca guiada básica está no MVP: questão genérica, seleção TJPR/TJSC/TJRS/TRF4/STJ/STF, copiar/compartilhar termos, abrir portal oficial e salvar consulta. Filtros jurídicos ricos, busca federada, resultados/ementas, comparação de decisões contrárias e classificação de precedente continuam na onda seguinte e exigem provedor/licença ou integração oficial comprovada.
- Fontes oficiais e/ou provedor contratado, inteiros teores quando disponíveis, identificação de precedente vinculante/qualificado e status conhecido, decisões contrárias e links.
- Chat RAG sobre corpus permitido, respostas com citação clicável e trecho literal; “não encontrei evidência suficiente” é resposta válida.
- Drive primeiro read-only/seleção de arquivos; indexação seletiva e revogação; depois avaliar sincronização de pastas.
- Entregar em Configurações → Integrações uma tela de owner para cadastrar IDs/redirects e, quando necessário, segredos server-side, além de uma etapa OAuth da usuária. Explicar em linguagem simples que Google API key identifica Picker/projeto e não abre Drive privado; Microsoft Graph usa OAuth/Entra. Distinguir “configuração válida” de “conta conectada”.

### Onda 4 — App nativo e recursos de produtividade avançada

- Android e iOS com push opt-in, biometria para desbloqueio local, links profundos, share sheet, câmera/arquivo e modo de rede instável; segredo nunca em app móvel.
- Compartilhamento social guiado, calendário editorial, export de assets e depois publicação direta aprovada por cada rede.
- Skills configuráveis por templates aprovados, integrações mais amplas, equipe e portal de cliente só se a rotina demonstrar valor.

### Onda 5 — SaaS escalável e mercados novos

- Multi-escritório/tenancy, permissões por papel, cobrança, white-label e outros países somente depois de validação de produto, compliance e limites técnicos.
- Evoluir armazenamento/DB se D1 atingir limites medidos ou requisitos de clientes exigirem isso. Migração com export íntegro e sem bloquear trabalho.

## 5. Fora do MVP inicial

- Peticionamento automático; leitura automática de citação/intimação com confirmação; cálculo autônomo e final de prazo; geração e protocolo de peças sem revisão.
- Robôs de login/scraping com certificados pessoais; distribuição comercial de cópia de base pública sem autorização.
- Contabilidade, fiscal, conciliação bancária, emissão de notas ou gestão financeira ampla sem levantamento com Márcia.
- Auto-posting em todas as redes, campanha automática, publicação sem aprovação, lead gen vedado ou promessa de resultado jurídico.
- Plug-in arbitrário com execução de código por usuário; começar por capacidades allowlist e schemas tipados.

## 6. Plano de entrevistas e validação com Márcia

Sessão 1 (30–45 min): pedir para Márcia demonstrar sem revelar informação desnecessária como inicia o dia, encontra um caso, percebe novo andamento, acompanha prazo, prepara audiência e lança recebimento/despesa. Perguntar quais erros são caros e quais alertas são ruído.

Sessão 2 (30 min): protótipo com tarefas sintéticas. Não explicar a interface antes da tentativa. Marcar conclusão, tempo, hesitação, cliques errados, palavras que ela usa e se entendeu origem/certeza. Perguntar “o que esperava acontecer?” e “o que dá confiança?”.

Sessão 3: revisar permissões, configuração de Drive/assinatura, exemplo de alerta e chat com jurisprudência; pedir que encontre a fonte e explique o que ainda precisa conferir. Recolher autorização antes de conectar qualquer conta real.

Nunca usar gravação/transcrição com informação protegida sem consentimento, aviso e ferramenta de armazenamento aprovada. Se não houver consentimento, fazer anotações sem dado pessoal.

## 7. Checklist de saída do MVP

**Estado dos conectores em 17/11/2026:** roadmap e UX especificados, sem conta de provedor, credenciais, contrato, consentimento OAuth ou integração ativa. Só exibir “conectado” após fluxo real consentido e verificado; até lá, protótipo/mock deve estar rotulado. Critérios e fontes ficam em [02 — Pesquisa e evidências](02_PESQUISA_EVIDENCIAS.md) e requisitos de segredo/controle em [04 — Segurança](04_SEGURANCA_CI_TESTES_OPERACAO.md).

- [ ] Márcia consegue começar o dia sem treinamento e localizar as próximas ações.
- [ ] Cada processo tem origem dos campos, tribunal/UF, consulta oficial e estado de atualização.
- [ ] Nenhum prazo aparece como confirmado apenas por inferência/modelo.
- [ ] Cadastro de cliente/processo/tarefa e lançamento financeiro têm validação e desfazer/edição segura.
- [ ] Funciona em viewport móvel pequena e desktop sem rolagem horizontal desnecessária.
- [ ] A operação diferencia dado demonstrativo de dado real e demonstra erro sem perder contexto.
- [ ] Márcia aprovou nomenclatura e ordem de informação.
- [ ] Todos os E2E críticos passam nas plataformas entregues; plataforma sem runner local é validada na CI apropriada.
