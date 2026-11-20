# Segunda rodada do Luna — Tour guiado com destaque

**Estado (19/11/2026):** destaque implementado nas seis etapas globais e nas ajudas contextuais; a jornada Playwright renderizada passou em Chromium desktop e viewport móvel. Uma regressão identificada na revisão foi corrigida: se a persistência da primeira visita falha, “Fechar guia” mantém a orientação aberta com o erro e a ação de tentar novamente; a tentativa seguinte só encerra após confirmação da API. Permanecem validação humana/assistiva e Android nativo.

## Entrega esperada

Cada etapa ilumina o controle real por meio de uma abertura no fundo escurecido. Uma caixa curta de instrução fica próxima do alvo e abre espaço para ele. O tour leva a pessoa ao alvo, explica o que fazer ali e permite avançar sem preencher, enviar ou alterar registros.

Manter a abertura no primeiro acesso, o progresso por conta, Voltar, Próximo, Pular, Fechar e Retomar. Trocar de aba manualmente pausa o tour; Ajuda volta à área e etapa salvas. Aplicar o mesmo mecanismo à ajuda da tela e à primeira visita a uma área ainda não vista depois de pular o tour. Somente um guia pode ficar aberto por vez.

## Sequência inicial e alvos

Usar um alvo principal por área nesta rodada. Isso mantém as seis etapas e evita alterar o significado dos índices já gravados. Conferir os rótulos e estados no código antes de fixar os identificadores.

**Dependência do piloto de ergonomia:** coordenar as âncoras com [08 — Hierarquia de ações e cadastros](08_HIERARQUIA_ACOES_E_CADASTROS.md). Onde um formulário passar a abrir sob demanda, a etapa da lista destaca primeiro o botão que o abre. Explicar o campo na ajuda do formulário após a abertura voluntária. A regressão da captura continua sendo verificada com o campo fora do viewport quando o formulário está aberto.

| Etapa | Alvo inicial | Instrução curta |
| --- | --- | --- |
| Hoje | Campo **Buscar no escritório** | Digite um nome ou termo para achar um item sem percorrer todas as abas. |
| Processos | **Novo processo** na lista; campo **Tribunal do processo** na ajuda do formulário | Abra o cadastro pelo botão no topo. No formulário, comece pelo tribunal e confira o número e o andamento na fonte oficial. |
| Agenda | Campo **Título da tarefa** | Escreva o próximo passo. A data de uma tarefa organiza o trabalho e não confirma prazo judicial. |
| Financeiro | Campo **Valor em reais e centavos** | Informe o valor do lançamento. O resumo depende dos valores registrados no escritório. |
| Pesquisa | Campo **Questão jurídica para pesquisar** | Digite a questão, escolha o tribunal e confira o resultado na fonte oficial. |
| Arquivos | Botão de selecionar PDF do dispositivo | Escolha um PDF para começar. Vincule ao processo, quando fizer sentido, antes de guardar. |

## Ordem de implementação

1. **Ler o fluxo atual.** Abrir `apps/mobile/src/GuidedTourOverlay.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/src/components/Ui.tsx`, as seis telas e os cenários de tour em `e2e/workspace.spec.ts`. Conferir também as instruções de cada pasta, o [plano de UX](01_PRODUTO_UX_ROADMAP.md) e o [plano de segurança e testes](04_SEGURANCA_CI_TESTES_OPERACAO.md). Revisar `git status --short` antes de editar.
2. **Fazer um piloto em Processos.** Anotar o campo com um identificador estável e uma ref em um elemento mensurável. A etapa deve esperar a aba ativa e o formulário montado. Se a tela estiver na visão de clientes, usar uma âncora visível dessa visão para orientar como chegar a processos, ou oferecer explicitamente abrir a visão de processos. Preservar qualquer rascunho. Expor a rolagem do `Screen` ao guia para trazer o alvo à área visível, sem abrir o teclado nem focar automaticamente o campo de edição. Mostrar o destaque só depois de a rolagem e o layout produzirem uma medida válida.
3. **Desenhar a abertura e posicionar a instrução.** Medir alvo e contêiner no mesmo sistema de coordenadas. Usar uma camada decorativa leve, por exemplo quatro retângulos ao redor da abertura, com margem e contorno visível. Posicionar a instrução abaixo ou acima do alvo conforme o espaço; no desktop, considerar também os lados. No celular, limitar a altura e permitir rolar o conteúdo da instrução quando necessário. Manter alvo e controles visíveis dentro da área segura, inclusive com teclado aberto, zoom ou texto ampliado. Se a tela ficar pequena demais, usar uma instrução compacta fora do recorte com opção de fechar. Evitar interceptar cliques e rolagem na área escurecida.
4. **Tratar mudanças sem saltos nem travamentos.** Recalcular a posição após rolagem, mudança de tamanho, orientação, teclado ou mudança do layout do alvo. Ignorar medidas atrasadas de outra tela ou etapa e cancelar medições/listeners ao fechar, sair da aba ou trocar de conta. Quando o alvo estiver temporariamente ausente, permitir fechar, pular ou tentar novamente com uma explicação curta. Não escurecer a tela inteira nem marcar o guia como visto por uma montagem incompleta.
5. **Ligar as seis áreas e a Ajuda ao mesmo mecanismo.** Separar descrição dos passos, resolução/medição de alvos e apresentação. Preservar o índice de 0 a 5, o progresso por conta e a atualização por versão já existente. Manter a marcação de tela vista vinculada a uma orientação efetivamente apresentada. Uma falha ao salvar deve manter a ação disponível com mensagem e opção de tentar de novo. Esta rodada cabe em `apps/mobile` e nos cenários de teste; a persistência existente comporta as seis etapas.
6. **Ajustar teclado e leitor de tela.** Anunciar área, número da etapa, nome do alvo e instrução quando a etapa estabilizar. Colocar o foco de navegação na instrução ou em seu primeiro controle, sem abrir o teclado virtual. Manter Tab e Shift+Tab previsíveis, oferecer Escape no Web e devolver o foco à Ajuda ou a um controle visível quando fechar. A máscara é decorativa e fica fora da árvore acessível. Respeitar movimento reduzido na rolagem e nas transições.

## Aceite e validação

- **Reprodução da captura:** ao avançar a Processos com o formulário fora do viewport, a tela rola até o alvo, o entorno escurece e o campo fica visível e destacado. A instrução fica fora dele e o botão Próximo continua acessível.
- **Geometria no Web:** em Playwright, comparar área medida do alvo, abertura da máscara e caixa da instrução. Asserções devem provar que a abertura abrange o alvo, que a instrução não o cobre e que ambos estão dentro da área visível. Repetir após rolar e redimensionar. Cobrir desktop com menu lateral e celular com abas inferiores.
- **Percurso:** conta sintética nova percorre as seis etapas. Voltar restaura alvo e texto; Fechar preserva o passo; sair de uma aba não força retorno; Ajuda retoma o passo correto; Pular libera a interface. Primeira visita após Pular oferece guia contextual; revisita fica livre; Ajuda permite revê-lo. Conferir alvo ausente, falha de persistência e troca de conta. Nenhuma etapa pode criar dados, abrir seletor de arquivos ou executar uma consulta por conta própria.
- **Validação manual:** percorrer com teclado, leitor de tela, movimento reduzido, zoom de 200% no Web e texto ampliado no Android. Conferir celular estreito, teclado virtual e mudança de orientação. Em Android, registrar evidência em dispositivo ou emulador viável. iOS fica para a sessão escolhida pelo usuário.
- **Comandos locais:** `pnpm --filter @marcia/mobile typecheck`, `pnpm --filter @marcia/mobile lint`, `pnpm --filter @marcia/mobile export:web`, `pnpm typecheck:e2e` e `pnpm e2e:web`. Usar D1 descartável, somente dados sintéticos. Não disparar Actions, push ou deploy.

## Resultado técnico e continuidade (19/11/2026)

- Implementadas âncoras mensuráveis, rolagem até o alvo, máscara decorativa de quatro áreas, contorno dourado, cartão reposicionado sem cobrir o elemento, adaptação desktop/celular, redimensionamento e alternativa quando o alvo não é localizado.
- O E2E renderizado verificou nas seis telas que o alvo fica dentro do destaque, o cartão não o cobre e ambos permanecem no viewport; também redimensionou a janela, alternou Processo entre o botão **Novo processo** e o campo **Tribunal do processo**, percorreu Ajuda/contexto, retomada e as etapas globais.
- A nova regressão falhou de propósito a primeira gravação da ajuda de Agenda com HTTP 503, confirmou mensagem e botão de repetição, e então verificou que a segunda gravação fechou a ajuda e persistiu o estado. Jornada completa passou **2/2** (Chromium desktop e viewport móvel, mais recente 6,3 min), com D1 descartável e dados sintéticos. Mobile typecheck/lint, E2E typecheck, contraste (15 pares) e `git diff --check` passaram; Expo Web export foi gerado antes da execução. Uma execução desktop subsequente passou **1/1 em 3,6 min** e validou adicionalmente o setup responsivo.
- **Ainda falta:** sessão moderada com Márcia; validar teclado, foco, Escape, leitores de tela, movimento reduzido e zoom de 200%; verificar Android com TalkBack em dispositivo/emulador. iOS permanece adiado por decisão da usuária. Não houve consulta a tribunal, integração externa, GitHub Actions, push ou deploy.
- **Próxima ação:** após obter a revisão de Márcia, corrigir os bloqueios observados e repetir a jornada. Se não houver acesso à sessão humana agora, seguir o próximo P1 no plano mestre: reconciliar a captura de setup enviada com a URL/export realmente servido e validar identidade em todas as telas.

## Reprodução local da prova do tour

Para reproduzir a jornada completa, o export deve apontar para o mesmo Worker loopback que o Playwright sobe; não reutilize um export com outra porta. Troque as portas se alguma já estiver ocupada e mantenha a API da exportação igual à API do teste.

```sh
MARCIA_E2E_API_BASE_URL=http://127.0.0.1:24041 pnpm run e2e:web:build
MARCIA_E2E_API_BASE_URL=http://127.0.0.1:24041 \
MARCIA_E2E_MAINTENANCE_API_BASE_URL=http://127.0.0.1:24042 \
MARCIA_E2E_WEB_BASE_URL=http://127.0.0.1:24043 \
MARCIA_E2E_SITE_BASE_URL=http://127.0.0.1:24044 \
MARCIA_E2E_OAUTH_BASE_URL=http://127.0.0.1:24045 \
MARCIA_E2E_D1_DIR=/tmp/marcia-e2e-tour-replay/d1 \
pnpm exec playwright test e2e/workspace.spec.ts \
  --project=desktop-chromium --project=mobile-chromium \
  --grep 'configura o escritório, registra processo, tarefa e financeiro e conserva os dados'
```

O caminho de D1 deve ser novo/descartável por rodada. O teste usa exclusivamente dados sintéticos e não requer Actions, deploy ou APIs externas.
