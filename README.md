# Márcia — site e plataforma jurídica

Este repositório mantém o site institucional público no diretório raiz e inicia, em aplicações separadas, uma plataforma de produtividade jurídica para Márcia. O site não recebe dados de clientes; o produto autenticado não é publicado no GitHub Pages.

## Estado atual

- `src/`: site institucional Vite/React original e a demonstração fictícia `/escritorio`. Essa rota é pública, usa exemplos em memória e não oferece controle de acesso; ela será publicada junto com o site quando `main` disparar Pages.
- `apps/mobile/`: app Expo/React Native em TypeScript para Web, Android e iOS. O app tem login/setup owner e fluxos persistentes de assuntos, processos manuais, tarefas, compromissos, financeiro simples e pesquisa jurídica guiada.
- `apps/api/`: Cloudflare Worker + D1 local com Better Auth e endpoints de domínio protegidos por tenant.
- `packages/contracts/`: contratos TypeScript/Zod compartilhados.
- `docs/PLANO_EXECUCAO_MARCIA.md`: visão completa, estado, decisões e próximo passo de execução.

Esta é uma primeira fatia funcional, ainda não um produto pronto para dados de clientes. A pesquisa jurídica é guiada por portais oficiais; o conector DJEN permanece desligado, e não há monitoramento automático nem cálculo de prazo. As telas de Drive/OneDrive, OAuth/importação local e manifestação eletrônica têm implementação inicial, mas não foram conectadas a contas reais; a busca não coleta jurisprudência, e chat de IA ainda não foi implementado. Use apenas dados inventados até concluir revisão de segurança e ativar provedores com credenciais adequadas. Os ZIPs fornecidos contêm informação jurídica/pessoal e não devem ser copiados para código, prompt, screenshot, fixture ou teste.

## Requisitos e instalação

Use Node `22.14.0` (`.node-version`) e pnpm `10.27.0` (`packageManager`). Na raiz:

```sh
pnpm install --frozen-lockfile
```

O workspace libera scripts de build apenas para as versões travadas de SWC, esbuild e workerd necessárias às ferramentas atuais. O lockfile é único na raiz.

## Comandos de desenvolvimento

### Site institucional (root)

```sh
pnpm dev
pnpm lint
pnpm test
pnpm build
```

O workflow `pages.yml` continua publicando somente o build do site raiz no GitHub Pages.

### App Expo

O comando `pnpm run dev` na raiz inicia apenas o site público Vite em `http://localhost:3000`; `/escritorio` é uma demonstração fictícia e não mostra o app privado. Para executar o produto localmente, use dois terminais na raiz do repositório.

1. A configuração local já foi preparada neste checkout: `apps/api/.dev.vars` contém secrets aleatórios apenas para desenvolvimento, e `apps/mobile/.env.local` aponta para `http://127.0.0.1:8787`. Os dois arquivos são ignorados pelo Git. Em uma instalação nova, copie os `.example` correspondentes e substitua os placeholders conforme [apps/api/README.md](apps/api/README.md); nunca use esses valores para produção.
2. No **Terminal 1**, aplique as migrations locais e mantenha a API em execução:

```sh
pnpm --filter @marcia/api db:migrate:local
pnpm --filter @marcia/api dev
```

3. No **Terminal 2**, inicie a versão Web do app Expo:

```sh
pnpm --filter @marcia/mobile web
```

4. Abra `http://127.0.0.1:8081` no navegador. Use o mesmo host (`127.0.0.1`) no app e na API para que o navegador mantenha o cookie de sessão. Se o Expo escolher outra porta, ajuste `WEB_ORIGIN` em `apps/api/.dev.vars` e reinicie o Wrangler. Na primeira visita, escolha **Primeira configuração do escritório**. Use o valor de `SETUP_OWNER_TOKEN` do arquivo local `apps/api/.dev.vars` junto com nome, e-mail e senha.

Essa execução usa Worker/D1 local. Ela não acessa tribunais, Google, Microsoft ou redes sociais e não publica nada. Se o objetivo for apenas ver o site público, aí sim use `pnpm run dev` e abra `http://localhost:3000`.

### Sessão isolada de usabilidade

Para testar a primeira configuração e o tour sem tocar na D1 local de desenvolvimento, use uma sessão separada. Ela cria uma D1/R2 local sob `.local/usability-sessions/`, exporta o app com URL própria e aceita conexões somente em `127.0.0.1`:

```sh
pnpm usability:session -- ux-marcia-01
```

Abra `http://127.0.0.1:8082` e leia o código de configuração no seu terminal com `cat .local/usability-sessions/ux-marcia-01/.setup-token` (substitua pelo ID usado). O launcher nunca imprime o valor secreto; os arquivos de segredo ficam com permissão `0600` dentro de uma pasta `0700`. Crie uma conta de demonstração com e-mail `example.test` e cadastre somente dados fictícios. Para reabrir a mesma sessão, execute novamente o mesmo ID; para observar o primeiro acesso desde o início, escolha outro ID. `Ctrl+C` encerra os servidores e mantém a base isolada para retomada. Os arquivos ficam ignorados pelo Git; remova uma sessão apenas depois de confirmar que não precisa mais dos dados dela.

É possível manter mais de uma sessão em execução. Configure portas diferentes ao criar cada ID, por exemplo: `MARCIA_USABILITY_API_PORT=8789 MARCIA_USABILITY_WEB_PORT=8083 pnpm usability:session -- ux-marcia-02`. Reutilize as mesmas portas para retomar esse ID; o launcher recusa uma combinação diferente para evitar apontar o bundle ou a D1 ao servidor errado.

O site público continua em `http://localhost:3000`. Este comando não faz deploy, não inicia GitHub Actions e não contata tribunais, Google, Microsoft ou redes sociais.

```sh
pnpm --filter @marcia/mobile export:web
pnpm --filter @marcia/mobile typecheck
pnpm --filter @marcia/mobile lint
```

Para Android nativo, ajuste `EXPO_PUBLIC_API_URL` para `http://10.0.2.2:8787` no emulador Android padrão e execute `pnpm --filter @marcia/mobile android`; isso requer SDK/JDK/emulador ou dispositivo. Build iOS requer macOS e Xcode; por decisão do usuário, a validação iOS está adiada até uma sessão futura escolhida manualmente. A exportação web é artefato local, não publicação privada.

### API Cloudflare

```sh
pnpm test:api
pnpm --filter @marcia/api typecheck
pnpm --filter @marcia/api build
pnpm --filter @marcia/api db:migrate:local
pnpm --filter @marcia/api dev
```

O Worker está configurado para desenvolvimento local, sem rota pública, com deploy bloqueado. Não apontar para D1 remoto nem adicionar segredo ao Git. Consulte o README específico da API antes de executar migrações ou configurar secrets.

O ensaio sintético `pnpm backup:drill` passou em 18/11: exportou/importou uma D1 local descartável e restaurou objetos fictícios nos dois R2 locais, validando hashes, descriptografia e integridade. Os artefatos ficam em `.local/backup-drills/`. Não lê a D1 de desenvolvimento nem prova recuperação de recursos remotos ou dos dados do escritório.

### Consulta avulsa ao DataJud

Na raiz, execute `pnpm datajud:consulta "NÚMERO_CNJ"` com um número público válido, com ou sem pontuação. O comando identifica TJPR, TJSC, TJRS ou TRF4 pelos dígitos do CNJ, faz uma única pesquisa e mostra um resumo no terminal. A chave pública vem de `.local/datajud-public-key`, ignorado pelo Git, ou da [Wiki oficial do CNJ](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) quando o arquivo não existe. Se a chave girar ou a Wiki bloquear a leitura automatizada, abra a página oficial e salve só o valor vigente nesse arquivo.

Use apenas como diagnóstico avulso, dentro do [termo de uso do DataJud](https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/). A consulta não cadastra processos, não grava a resposta no app e não valida prazos.

### Contratos

```sh
pnpm --filter @marcia/contracts typecheck
```

## CI e testes

`.github/workflows/ci.yml` valida PRs e pode ser iniciado manualmente; não roda a suíte no push para `main`, para evitar minutos duplicados. Inclui lint, testes do site e da API (`pnpm test:api`), builds e Playwright E2E em Chromium desktop/mobile, site público e WebKit mobile no runner hospedado. `.github/workflows/native-e2e.yml` é manual. `pnpm e2e:auth` roda MFA, logout, renovação/expiração de sessão, troca autenticada e redefinição de senha em Chromium desktop e viewport móvel, mais cenários de limite por e-mail/IP, recriando D1 para cada execução; a redefinição usa uma caixa postal sintética em memória, ativada somente no Worker local loopback, e desliga screenshot/vídeo/trace. Cobre revogação de sessão no logout, troca e reset de senha; sessões vencidas; senha antiga/nova e limites 11/12/129 no reset; link usado/expirado; token inválido; MFA após reset e `Retry-After` consistente. O script apaga o banco temporário e os artefatos sensíveis ao terminar. A rodada atual passou 10/10; não envia e-mail real. Para evitar conflito com sessão Expo em 8082/8083, os endereços locais aceitam override, por exemplo `MARCIA_E2E_WEB_BASE_URL=http://127.0.0.1:28082 MARCIA_E2E_SITE_BASE_URL=http://127.0.0.1:23101 pnpm e2e:auth`; API/OAuth também aceitam `MARCIA_E2E_API_BASE_URL` e `MARCIA_E2E_OAUTH_BASE_URL`. A suíte Web principal local mais recente passou 5/5: app renderizado em Chromium desktop, viewport móvel Chromium, manutenção e site público; a execução nativa Android continua pendente. iOS está adiado até uma sessão futura escolhida manualmente — não selecionar `ios` ou `all`. `.github/workflows/pages.yml` continua publicando somente o site público raiz em push a `main`, sem publicar app/API. Comandos locais: `pnpm test:api`, `bash scripts/e2e-web.sh`, `pnpm e2e:auth` e `pnpm typecheck:e2e`.

O job mobile também executa `pnpm check:brand-parity`, que compara marsala/dourados semânticos do tema Expo com `src/index.css` e verifica que o PNG MB é idêntico ao asset institucional.

## Continuidade e decisões

Após uma interrupção, comece pelo [checkpoint durável de retomada](docs/ai/CURRENT_STATE.md) e depois leia [o plano mestre](docs/PLANO_EXECUCAO_MARCIA.md). Instruções curtas por pasta ficam em `AGENTS.md`/`CLAUDE.md`; decisões arquiteturais com ressalvas ficam em `docs/adr/`; a pesquisa com fontes está em `docs/plano/02_PESQUISA_EVIDENCIAS.md`.
