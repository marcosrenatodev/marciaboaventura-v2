# Instruções para `apps/api/`

- Leia o plano mestre e os documentos `03`/`04` antes de ampliar a API. O estado e as decisões ficam no plano; não duplicar o roadmap aqui.
- O Worker já tem Better Auth/D1, bootstrap inicial fechado e a primeira fatia de dados operacionais. `/health` indica somente liveness; não representa produção, D1 disponível ou prontidão para dados reais.
- Preserve o placeholder D1 inválido, `remote: false`, `workers_dev: false`, `preview_urls: false` e o bloqueio de deploy até existir configuração remota revisada. Não copiar IDs/chaves da conta para exemplos.
- Sem dados reais, credenciais, documentos judiciais ou conteúdo dos ZIPs em código, migrações, fixtures, saídas ou logs. Cada endpoint de domínio exige sessão, membership e tenant derivado no servidor em cada operação; FKs compostas são defesa adicional, não substituem autorização.
- Migrações são incrementais e forward-only; nunca alterar migration aplicada. Sem seeds reais ou operações destrutivas implícitas. Antes de dado real, ensaiar export/restore e isolamento entre tenants.
- Gere tipos com `pnpm generate-types`; não escreva tipos de runtime manualmente. Mantenha dependências e lockfile único alinhados com o responsável pela integração.
- Informe checks realmente executados. Não declarar produção, migração remota, cobertura judicial ou integração externa concluídas com base em typecheck/build.
