# App Expo web e nativo

- Leia o `AGENTS.md` da raiz e `../../docs/PLANO_EXECUCAO_MARCIA.md`, principalmente os planos 01 e 03, antes de mudar produto ou arquitetura.
- Esta pasta é um app separado do site Vite. Não importe `../../src`, componentes DOM/shadcn ou o React 18 do site. Use React Native e Expo Router.
- O app tem modo demo sintético e separado, além de autenticação Better Auth e chamadas à API. Demo nunca escreve na API; modo conectado só exibe dados após validar sessão/tenant e resposta. Não simule sincronização, consulta judicial, assinatura ou integração externa.
- Só use dados inventados; nunca copie ZIPs, dados do escritório, números reais de processos ou documentos para fixtures, logs ou screenshots. Tarefas e agendamentos organizam o trabalho; não são prazos confirmados.
- Valores monetários ficam em centavos inteiros. Preserve ações grandes, rótulos claros, foco, leitor de tela, texto escalável, safe areas e controles principais de pelo menos 48 pontos.
- Preserve ações grandes, rótulos legíveis, foco de teclado, leitor de tela, texto escalável, safe areas e prioridade antes de financeiro. Alvos principais têm no mínimo 48 pontos.
- Dependências nativas devem seguir a matriz do SDK instalado. Consulte o README; execute `expo install --check` antes de alterar versões. Não ignore diagnóstico para mascarar incompatibilidade.
- O workspace/lockfile é único na raiz. Não crie lockfile concorrente nem inclua segredos em `EXPO_PUBLIC_*`, localStorage, bundle, screenshot ou log.
- Verifique TypeScript, lint e export web; teste nativo Android em ambiente adequado e iOS em runner macOS/Xcode. Informe o que não foi executado.
- `CLAUDE.md` importa este arquivo; mantenha uma fonte de instruções.
