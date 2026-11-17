# Márcia — app Expo

Scaffold separado do site Vite para Android, iOS e web, em TypeScript e Expo Router. Entry: `expo-router/entry`; rotas: `app/`; componentes/dados: `src/`. Não importa código ou React do site público.

Inclui login por e-mail e primeira configuração do owner, além de uma área autenticada que confirma a sessão e o tenant antes de mostrar dados. Com API configurada, o app cadastra assuntos, processos/casos manuais, tarefas, compromissos, receitas/despesas e consultas genéricas de jurisprudência. Os registros ficam persistidos pela API. A busca guiada abre TJPR, TJSC, TJRS, TRF4, STJ ou STF, ajuda a copiar/compartilhar termos e guarda a consulta; não coleta resultados nem faz scraping. Navegação inferior no celular e lateral a partir de 1000 px, conteúdo em duas colunas em telas amplas, ações de pelo menos 52 pontos, texto escalável e foco visível.

O app inclui telas de login por e-mail/senha e primeira configuração do owner, com rotas privadas. A URL é lida de `EXPO_PUBLIC_API_URL`. O cliente Better Auth Expo mantém cookies/sessão no SecureStore em Android/iOS. A primeira configuração chama `POST /api/setup/owner` com `{ name, email, password, setupToken }`; o signup público continua fechado.

O Worker implementa Better Auth, bootstrap do primeiro owner e endpoints persistentes de domínio. Web e Android foram exercitados ponta a ponta contra API e D1 locais descartáveis. Android e iOS usam a mesma jornada nativa Maestro para validar setup, processo, agenda, financeiro e pesquisa; o iOS depende do runner macOS do GitHub. Sem a variável de ambiente, login, setup e dados remotos ficam indisponíveis, e a aplicação explica esse estado. A demonstração local é um caminho separado e explícito; usa somente exemplos inventados em memória, sem API ou salvamento. As telas demonstrativas seguem identificadas como demonstração mesmo após autenticação.

O app oferece cadastro/listagem, conclusão/reabertura de tarefas, cancelamento de compromissos e mudança de lançamento previsto para pago/recebido; edição livre e exclusão ainda não estão disponíveis. Cadastro de processos é manual: nenhum tribunal é consultado e não há sincronização de andamentos, publicações ou prazos. Também não há cálculo de prazo, IA, documentos, integração bancária ou conectores externos. Consultas são salvas no escritório e só são pesquisadas quando a usuária copia os termos e abre o portal. Tarefas e datas organizam o trabalho e não confirmam prazo judicial. Não use dados reais antes da revisão de segurança e operação. `noindex` é indicação para buscadores, não controle de acesso.

Para configuração local, copie `.env.example` para `.env.local` e ajuste `EXPO_PUBLIC_API_URL`. Use `http://127.0.0.1:8787` na Web/simulador local; no emulador Android padrão use `http://10.0.2.2:8787`; em dispositivo físico, use o IP LAN acessível do computador. Nunca coloque token de setup ou segredo de servidor nessa variável: tudo em `EXPO_PUBLIC_*` é público no bundle do app.

## Versões verificadas em fontes oficiais

Consultado em 16/11/2026: a [matriz oficial do SDK 58](https://github.com/expo/expo/blob/sdk-58/packages/expo/bundledNativeModules.json) lista RN `0.88.1`, React/React DOM `19.3.0`, Router `~58.0.31` e RN Web `~0.21.4`. O [pacote Expo](https://github.com/expo/expo/blob/sdk-58/packages/expo/package.json) informa `58.0.25` e Node `^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`. O [template oficial](https://github.com/expo/expo/blob/sdk-58/templates/expo-template-default/package.json) usa TypeScript `~6.0.3` e tipos React `~19.3.0`. O package segue esse conjunto, sem canary/RC.

A pesquisa sustenta Expo SDK 58/RN 0.88 do plano; não foi necessário propor outro SDK. As faixas precisam ser resolvidas no lockfile único. O Node 22.14.0 registrado na raiz satisfaz a faixa oficial. Nenhum runtime da raiz foi alterado aqui.

Referências de implementação: [instalação do Router](https://docs.expo.dev/router/installation/) para entry/plugin/dependências e [abas JavaScript](https://docs.expo.dev/router/advanced/tabs/) para navegação adaptável. Metro/Babel usam padrões Expo, sem import externo de `@react-navigation/*`.

Se `expo install --check` ou Doctor indicar divergência após resolução, confronte a matriz do pacote Expo efetivamente instalado e notas oficiais; ajuste versões em conjunto e regenere o lockfile. Não ignore o diagnóstico. As versões foram consultadas, mas a instalação não foi realizada.

## Validação em 17/11/2026

Em 17/11/2026 passaram typecheck, lint, exportação web, build/test/lint do site, typechecks dos contratos/API/E2E e Playwright em Chromium desktop/mobile e site público (3/3). No GitHub, a CI dos commits `577d7f4` e `ff765d3` passou incluindo WebKit, após corrigir clipboard/retries. Run nativo `44055069612`: o APK foi compilado, migrations locais passaram e a API/D1 respondeu; Expo SDK 58 rejeitou `--non-interactive`. No run `ff765d3`, Android compilou, mas o probe do Metro expirou em 90 segundos durante inicialização. Os dois jobs agora definem `CI=1`, usam sondas independentes e aguardam até 180s com estado/log de diagnóstico; novo run validará a correção. O E2E Android 1/1 anterior cobriu setup do owner, assunto, caso manual, tarefa, compromisso, despesa, status pago e consulta TRF4 persistida com D1 descartável e dados sintéticos. A repetição local após alterações da UX não concluiu: `/dev/kvm` ausente e System UI do emulador em ANR; o runner hospedado tem KVM e deep link direto do Expo. O build APK Android local passou: `apps/mobile/android/gradlew -p apps/mobile/android assembleDebug --no-daemon` (`BUILD SUCCESSFUL`, 11m17s). O artefato de 255 MB é development/debug universal para quatro ABIs, não distribuição; AAB/release otimizado, assinatura e medição de tamanho continuam pendentes. A API passou `wrangler deploy --dry-run` sem publicar. WebKit não é suportado pelo Playwright no Ubuntu 20.04.6 x64 local; CI hospedada foi aprovada. iOS não compila neste host Linux. `expo install --check` usou o mapa local do SDK porque a rede estava indisponível; trate como validação offline, não como validação remota completa.

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

Tema claro marsala/creme nesta etapa; modo escuro, ícones/splash finais e validação de usabilidade com Márcia permanecem pendentes. A aplicação já cobre uma fatia MVP persistente de rotina, mas integrações judiciais/documentais e operação segura de produção continuam fora da implementação ativa; consulte o plano mestre antes de ampliar o escopo.
