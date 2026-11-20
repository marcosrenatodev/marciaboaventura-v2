# Márcia — app Expo

Scaffold separado do site Vite para Android, iOS e web, em TypeScript e Expo Router. Entry: `expo-router/entry`; rotas: `app/`; componentes/dados: `src/`. Não importa código ou React do site público.

Inclui login por e-mail e primeira configuração do owner, além de uma área autenticada que confirma a sessão e o tenant antes de mostrar dados. Com API configurada, o app cadastra assuntos, clientes mínimos, processos/casos manuais, notas internas append-only por processo, tarefas, compromissos, receitas/despesas e consultas genéricas de jurisprudência. Os registros ficam persistidos pela API. A busca guiada abre TJPR, TJSC, TJRS, TRF4, STJ ou STF, ajuda a copiar/compartilhar termos e guarda a consulta; não coleta resultados nem faz scraping. O atalho Conteúdo em Hoje permite criar/editar rascunhos sociais privados por escritório, com tema e texto, copiar na Web ou abrir o share sheet nativo; não publica diretamente, não abre automaticamente o compositor de uma rede e não gasta verba de anúncio. O lembrete de revisão OAB não é validador de conformidade. A área owner-only de Integrações configura Google/Microsoft e armazena valores cifrados pelo Worker. OAuth permite importar PDFs do Google Picker Web e navegar/importar pastas e PDFs do OneDrive pessoal; no nativo o Google depende do seletor de arquivos do sistema. Os gates ficam desligados por padrão e não houve consentimento OAuth real, runtime R2 ou validação E2E desta integração. Navegação inferior no celular e lateral a partir de 1000 px, conteúdo em duas colunas em telas amplas, ações de pelo menos 52 pontos, texto escalável e foco visível.

O app inclui telas de login por e-mail/senha, primeira configuração do owner e recuperação de acesso. A URL da API é lida de `EXPO_PUBLIC_API_URL`. O cliente Better Auth Expo mantém cookies/sessão no SecureStore em Android/iOS. A primeira configuração chama `POST /api/setup/owner` com `{ name, email, password, setupToken }`; o signup público continua fechado. “Esqueci minha senha” envia link de uma hora se o Cloudflare Email Service estiver configurado; “Criar nova senha” valida token e confirma senha com mínimo de 12 caracteres. O reset revoga sessões anteriores e não desativa MFA. A tela Conta permite ativar MFA por TOTP, guardar códigos de recuperação, gerar substitutos, desativar com senha e trocar a senha. O login aceita autenticador ou código de recuperação de uso único. Wrangler local simula a entrega e escreve o link de reset em log/arquivo: use somente conta sintética e não colete essa saída. Envio real requer domínio sender no Email Service beta e Workers Paid para qualquer destinatário não verificado.

O Worker implementa Better Auth, bootstrap do primeiro owner e endpoints persistentes de domínio. A E2E Web exercita as jornadas com API e D1 locais descartáveis; a última suíte completa registrada passou antes da nova asserção transitória 503/retry, que ainda aguarda execução renderizada. A jornada Android Maestro passou anteriormente no run `44118724926` do SHA `3aa966b`; esse resultado não prova o estado atual do app. Nesta revisão o APK Android compilou localmente, mas a jornada nativa atual permanece pendente: o daemon ADB não iniciou devido ao bloqueio de socket do host e `/dev/kvm` não está disponível. Android e iOS compartilham o fluxo Maestro para setup, processo, agenda, financeiro e pesquisa; o iOS depende de runner macOS e continua adiado até sessão manual escolhida pelo usuário. Sem `EXPO_PUBLIC_API_URL`, login/setup e dados remotos ficam indisponíveis, e a aplicação explica esse estado. A demonstração local é um caminho separado, com exemplos inventados em memória e sem API ou salvamento. As telas demonstrativas continuam identificadas como demonstração após autenticação.

O app oferece cadastro/listagem, edição segura dos campos cobertos, conclusão/reabertura de tarefas, vínculo opcional das tarefas a assuntos, notas internas append-only por processo, cancelamento de compromissos e mudança de lançamento previsto para pago/recebido; nota não pode ser editada/apagada e exclusão ainda não está disponível. Cadastro de processos é manual: quando o número tem 20 dígitos, a aplicação valida o dígito verificador e formata conforme o padrão CNJ, mas não verifica se o processo existe. Há uma fatia manual de consulta DJEN somente leitura por processo, mas `DJEN_ENABLED=false` e nenhum tribunal foi consultado; não há sincronização automática de andamentos ou cálculo/confirmação de prazos. A aba Arquivos implementa cofre de PDF até 10 MiB, AES-GCM no Worker, R2 privado, metadados/auditoria D1, vínculo opcional a processo, download/share/arquivamento e importação Google/OneDrive. O registro interno de manifestação associa a conta autenticada e o hash do PDF a um aceite explícito e disponibiliza recibo hash; não altera nem assina criptograficamente o PDF e não equivale automaticamente a ICP-Brasil/PAdES ou a requisito de qualquer ato. As integrações e o registro de manifestação ainda não foram validados em runtime ou E2E; exigem `DOCUMENTS_ENCRYPTION_KEY` separada e OAuth sandbox, e a chave de Picker deve ser restringida por origem/API. A UI nativa usa seletor de arquivos do sistema para Google; Microsoft acessa apenas o OneDrive pessoal, não bibliotecas de sites SharePoint. OCR, malware scan e IA sobre documentos não estão implementados. Consultas de jurisprudência são salvas no escritório e só são pesquisadas quando a usuária copia os termos e abre o portal. Tarefas e datas organizam o trabalho e não confirmam prazo judicial. Não use dados reais antes da revisão de segurança e operação. `noindex` é indicação para buscadores, não controle de acesso.

Para configuração local, copie `.env.example` para `.env.local` e ajuste `EXPO_PUBLIC_API_URL`. Use `http://127.0.0.1:8787` na Web/simulador local; no emulador Android padrão use `http://10.0.2.2:8787`; em dispositivo físico, use o IP LAN acessível do computador. Nunca coloque token de setup ou segredo de servidor nessa variável: tudo em `EXPO_PUBLIC_*` é público no bundle do app. O Worker exige chaves Base64 aleatórias distintas em `apps/api/.dev.vars`: `INTEGRATION_CREDENTIALS_KEY` para OAuth e `DOCUMENTS_ENCRYPTION_KEY` para PDFs. Não reutilize valores; em ambientes reais use Worker Secrets e mantenha backup/rotação planejados.

## Build local Android

Use a versão Java do `.tool-versions` e configure o caminho do SDK instalado nesta máquina. Em uma instalação asdf com Temurin 17.0.21+9 e SDK em `~/Android/Sdk`:

```sh
export JAVA_HOME="$(asdf where java temurin-17.0.21+9)"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
cd apps/mobile/android
./gradlew assembleDebug --offline
```

O APK de desenvolvimento sai em `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. `assembleDebug` valida compilação/empacotamento; não prova que a interface inicia ou que os fluxos nativos passam. Para instalar/usar, é preciso um ADB funcional e dispositivo/emulador; o emulador deste host também precisa de KVM. O `.apk` debug com ABIs múltiplas é grande e não é artefato de distribuição. O build de 19/11/2026 passou offline com 733 tarefas (88 executadas), usando essas variáveis. Em outra máquina, ajuste `ANDROID_HOME` para o SDK instalado e retire `--offline` apenas se as dependências ainda não estiverem em cache.

## Versões verificadas em fontes oficiais

Consultado em 16/11/2026: a [matriz oficial do SDK 58](https://github.com/expo/expo/blob/sdk-58/packages/expo/bundledNativeModules.json) lista RN `0.88.1`, React/React DOM `19.3.0`, Router `~58.0.31` e RN Web `~0.21.4`. O [pacote Expo](https://github.com/expo/expo/blob/sdk-58/packages/expo/package.json) informa `58.0.25` e Node `^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`. O [template oficial](https://github.com/expo/expo/blob/sdk-58/templates/expo-template-default/package.json) usa TypeScript `~6.0.3` e tipos React `~19.3.0`. O package segue esse conjunto, sem canary/RC.

A pesquisa sustenta Expo SDK 58/RN 0.88 do plano; não foi necessário propor outro SDK. As faixas precisam ser resolvidas no lockfile único. O Node 22.14.0 registrado na raiz satisfaz a faixa oficial. Nenhum runtime da raiz foi alterado aqui.

Referências de implementação: [instalação do Router](https://docs.expo.dev/router/installation/) para entry/plugin/dependências e [abas JavaScript](https://docs.expo.dev/router/advanced/tabs/) para navegação adaptável. Metro/Babel usam padrões Expo, sem import externo de `@react-navigation/*`.

Se `expo install --check` ou Doctor indicar divergência após resolução, confronte a matriz do pacote Expo efetivamente instalado e notas oficiais; ajuste versões em conjunto e regenere o lockfile. Não ignore o diagnóstico. As versões foram consultadas, mas a instalação não foi realizada.

## Validação em 17/11/2026

Em 17/11/2026 passaram typecheck, lint, exportação web, build/test/lint do site, typechecks dos contratos/API/E2E e Playwright em Chromium desktop/mobile e site público. CI web `44118724895` no SHA `3aa966b` passou. No run nativo `44118724926`, Android compilou e a jornada Maestro passou 1/1, incluindo onboarding, processos, agenda, status financeiro Pago e busca salva. No iOS, compilação, inicialização, API e Metro passaram; Maestro fechou o alerta inicial, mas encontrou “Bundling 19%...” em vez da tela “Bem-vinda” antes do timeout. A rodada automatizada foi encerrada; investigar/preaquecer o bundle iOS antes de considerar nova execução. O repositório público usa runners padrão sem débito de minutos mensais. Reexecução local continua limitada pela falta de `/dev/kvm` e ANR do System UI. O APK development/debug local compilou com `BUILD SUCCESSFUL` (11m17s), mas não é pacote de distribuição; AAB otimizado, assinatura e medição de tamanho continuam pendentes. `wrangler deploy --dry-run` passou sem publicar. WebKit não é suportado no Ubuntu 20.04 local; iOS exige runner macOS.

Na retomada de 17/11, o fluxo social informativo ganhou uma rota Conteúdo acessível por Hoje, rascunhos D1 privados/editáveis e cópia/share sheet manual. Cenários sintéticos web/Maestro foram acrescentados; esta jornada não foi executada. A migration 0015 ainda requer validação junto da cadeia completa. Nenhuma Action foi iniciada; `gh run list` não conectou à API e não confirma estado remoto.

Depois dessa rodada, edição de assuntos, processos, tarefas abertas, compromissos agendados e lançamentos previstos, listagem de cancelados e agenda do dia na tela Hoje foram adicionadas localmente. Typechecks contracts/API/mobile, lint mobile e API dry-run build passaram; a cadeia de migrations foi exercitada em SQLite efêmero. `wrangler d1 migrations list DB --local` falhou por `listen EPERM 127.0.0.1`, então runtime D1, renderização das telas alteradas e E2E continuam pendentes. A agenda preserva o fuso ao editar e recusa horários de DST ambíguos/inexistentes; compromisso que cruza meia-noite ainda deve ser recriado e cancelado. Não foi enviada ao GitHub e não iniciou workflow; valide localmente antes da suíte final.

Para repetir a validação, a partir da raiz:

```sh
pnpm --filter @marcia/mobile typecheck
pnpm --filter @marcia/mobile lint
pnpm --filter @marcia/mobile export:web
pnpm --filter @marcia/mobile web
```

Para repetir o fluxo E2E Web que renderiza a aplicação em desktop/mobile e usa apenas banco D1 descartável com dados fictícios:

```sh
pnpm e2e:web
pnpm typecheck:e2e
```

O workflow `native-e2e.yml` executa a jornada Maestro compartilhada no emulador Android e simulador iOS. Android deve ser confirmado no runner hospedado com KVM; no host Linux sem KVM o System UI entrou em ANR. O resultado Android anterior à última atualização está em `/tmp/marcia-android-e2e-final.xml` e não comprova o código atual.

Executar `expo install --check` depois de uma alteração de versões/dependências, e `expo-doctor` em uma tarefa com rede habilitada. Não rodar instalação isolada criando outro lockfile.

O Expo CLI gera tipos de rotas ao iniciar/exportar; em checkout limpo, se forem necessários ao typecheck, execute primeiro o export ou inicie o servidor e repita o typecheck. Não grave `.expo/` no Git. O export cria `apps/mobile/dist/`, separado do site público. Só contém demonstração; não constitui hospedagem privada e não foi publicado.

Desenvolvimento nativo usa development build (`expo-dev-client`). `android` requer SDK/emulador/dispositivo/JDK compatíveis; `ios` requer macOS e Xcode. Os diretórios nativos gerados são ignorados pelo Git. Não há EAS project ID, credenciais, assinatura ou publicação configurada. `com.example.marciaescritorio.demo` é identificador provisório a substituir antes de distribuição.

```sh
pnpm --filter @marcia/mobile android
# Somente em macOS:
pnpm --filter @marcia/mobile ios
# Depois de instalada a development build:
pnpm --filter @marcia/mobile start
```

Revisão manual com Márcia pendente: 375/768/1440 px, retrato/paisagem, zoom 200%, texto ampliado, safe areas, foco/teclado, TalkBack/VoiceOver, retorno, busca vazia e compreensão dos rótulos. Nenhum prazo pode mudar para confirmado. E2E automatizado não substitui validação num dispositivo real.

Datas de agenda e vencimento são digitadas no padrão brasileiro `DD/MM/AAAA`; o app valida datas reais e converte para `AAAA-MM-DD`/instante com fuso antes de chamar a API.

Tema claro marsala/creme nesta etapa; modo escuro, ícones/splash finais e validação de usabilidade com Márcia permanecem pendentes. OAuth Google/Microsoft, Google Picker web, navegação/importação OneDrive e refresh server-side estão implementados localmente, mas sem credenciais de sandbox/consentimento, runtime Worker/R2 ou E2E; gates continuam desligados. Sincronização de arquivos, integração judicial validada e operação segura de produção seguem pendentes; consulte o plano mestre antes de ampliar o escopo.
