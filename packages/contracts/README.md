# @marcia/contracts

Contratos TypeScript/Zod compartilhados pelo app Expo e API Workers. Seguem o [plano de arquitetura](../../docs/plano/03_ARQUITETURA_IA_CLOUDFLARE.md). Não contêm documentos, credenciais, números processuais ou integrações reais.

| Exportação | Conteúdo |
| --- | --- |
| `MatterSummarySchema` / `MatterSummary` | Identificador opaco, escritório, título, estado ativo/arquivado e atualização. |
| `ClientCreateSchema`, `ClientSchema`, `ClientUpdateSchema` | Diretório mínimo de clientes: nome de exibição, email/telefone opcionais e estado ativo/arquivado. |
| `MatterClientSchema` | Informação segura de cliente vinculada a uma matéria: ID opaco, nome de exibição e estado. |
| `TaskSchema` / `Task` | Tarefa com vínculo opcional a caso, estado e agendamento manual opcional. |
| `MoneySchema` / `Money` | `amountCents`: inteiro seguro, positivo, zero ou negativo; `currency`: `BRL`. |
| `ExternalCaseSignalSchema` / `ExternalCaseSignal` | Sinal, proveniência, datas, estado da consulta e revisão humana. |
| `SourceReferenceSchema` / `SourceReference` | Proveniência externa com URL HTTPS opcional, referência/hash quando conhecidos e cobertura desconhecida/parcial; demonstração exige metadados fixos sem referências externas. |
| `HumanReviewSchema` / `HumanReview` | `pending`, `reviewed` ou `dismissed`; os dois últimos exigem identificador de revisor e momento da revisão. |
| `OpaqueIdSchema`, `TimestampSchema` e respectivos tipos | Identificadores técnicos e datas ISO com `Z` ou offset explícito. |
| `formatCnjCaseNumber` / `isValidCnjCaseNumber` | Formata e valida o dígito verificador do padrão CNJ de 20 dígitos conforme Resolução 65/2008; não verifica se o processo existe. |
| `SocialContentDraftCreateSchema`, `SocialContentDraftUpdateSchema`, `SocialContentDraftSchema` | Rascunho textual de divulgação informativa por tenant, seleção de rede, tema/texto e CAS para edição. Não valida regras éticas nem publica. |

Todos os objetos rejeitam campos extras. Não há coerção de strings em números ou datas. Campos sem valor conhecido usam `null` explicitamente. O tipo TypeScript sozinho não valida uma resposta: use `parse` ou `safeParse` na fronteira de entrada.

```ts
import { MatterSummarySchema, MoneySchema } from "@marcia/contracts";
import type { MatterSummary } from "@marcia/contracts";

const matter: MatterSummary = MatterSummarySchema.parse({
  id: "demo-matter-alpha",
  tenantId: "demo-office",
  title: "Caso fictício Alfa",
  status: "active",
  updatedAt: "2026-11-16T09:00:00-03:00",
});

const amount = MoneySchema.parse({ amountCents: 12500, currency: "BRL" });
// 12500 centavos representam R$ 125,00. Valores como 125.5 são rejeitados.
```

`observedAt` registra quando o sinal foi observado e `lastCheckedAt` a última consulta; não substituem `occurredAt`/`publishedAt`. Não invente datas, referências ou hashes ausentes. `unavailable`/`error` não significam ausência de movimentação. `unverified` preserva a necessidade de conferir o original. `reviewed` registra uma revisão humana, sem confirmar prazo, intimação, conclusão jurídica ou autenticidade da fonte.

`source.provider`, URL e cobertura são metadados declarados; validar seu formato não comprova origem, licença, atualidade ou cobertura. Demonstrações devem usar `kind: "demo"`, `coverage: "demo"`, provedor "Demonstração local" e `url`, `recordId` e `payloadHash` nulos. Não há chamadas de rede nem fontes judiciais simuladas como reais.

## Integração e limitações

- O pacote exporta TypeScript diretamente para bundlers Expo/Metro e Workers. Não há build JavaScript nem suporte a execução Node sem transformação. A resolução nos consumidores ainda precisa ser validada.
- Workspace, lockfile e CI ficam na raiz; Expo e Workers validam entradas/saídas na fronteira com estes contratos. O site público segue isolado e não importa este pacote.
- O site público no root continua isolado em Zod 3 para preservar sua stack; app/API/contratos compartilham Zod 4. O typecheck `pnpm --filter @marcia/contracts typecheck` passou em 17/11/2026. Cenários E2E consomem os contratos via API/app e ainda precisam rodar no fechamento da versão candidata.
- Antes de receber dados externos, adicionar testes de fronteira para campos extras, dinheiro fracionário/fora do intervalo seguro, datas sem fuso, dígitos CNJ incorretos e revisão sem revisor/data; testar os contratos ponta a ponta na API e no app.
- Os schemas não autenticam pessoas, não autorizam acesso, não provam isolamento por `tenantId`, não conferem vínculo entre entidades e não registram auditoria. Essas responsabilidades ficam no backend; nunca aceitar um estado de revisão do cliente como prova de ação humana.
- Não há detecção de PII em texto livre; usar somente dados inventados nesta fase. Não incluir nome, CPF, CNJ, segredo ou payload de documentos em exemplos, respostas de erro ou logs de validação.
- Não há regras/cálculo de prazo, decisões jurídicas, conversão cambial, somas de dinheiro, persistência, OpenAPI ou contratos de eventos versionados. `scheduledOn` guarda a data civil escolhida pela usuária para organizar uma tarefa; não representa vencimento processual. O modelo precisa ser validado com Márcia antes de dados reais.
