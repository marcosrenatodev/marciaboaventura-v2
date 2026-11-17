# 05 — Modelo de domínio para o primeiro MVP persistente

> **Estado em 17/11/2026:** fatia local exercitada com dados sintéticos para assuntos, processos manuais, tarefas, compromissos, financeiro e buscas de jurisprudência salvas. O acesso a fontes judiciais continua manual e a operação real segue bloqueada até revisão de privacidade e validação com Márcia.

## Objetivo da fatia

O fluxo persistente local permite autenticar/configurar o owner, criar/listar assuntos e processos manuais, cadastrar tarefas e compromissos, registrar receitas/despesas simples e salvar consultas genéricas de jurisprudência. D1 mantém os registros e a API deriva o tenant da sessão. A pesquisa abre portais oficiais; não existe consulta automática, resultados copiados, notificação de tribunal ou classificação de precedentes. Tarefas/datas não são prazos judiciais.

## Regras de modelagem

- D1/SQLite; toda tabela de domínio tem `tenant_id`, PK composta `(tenant_id, <id>)` e FKs compostas para impedir vínculos entre escritórios. Integridade referencial complementa autorização e não a substitui.
- Usar IDs técnicos aleatórios; número CNJ é dado sensível e nunca é chave primária, log ou argumento de rota de listagem ampla. Normalizar/validar CNJ numa etapa dedicada antes de indexação.
- Valores em centavos como inteiro seguro, moeda `BRL`; sem `float`. Uma receita/despesa por lançamento, sem parcelas, recorrência, conciliação, nota fiscal ou contabilidade nesta fatia.
- Instantes como ISO-8601 UTC e timezone IANA quando o significado depende do fuso. `due_on` é data civil `YYYY-MM-DD` e não deve virar instante UTC.
- Tarefa agendada, audiência/compromisso e sinal do tribunal são entidades diferentes. Nenhum campo da tarefa transforma-se em prazo processual confirmado; cálculo de prazo fica fora da fatia.
- Sem hard delete por endpoint. Arquivar/cancelar é explícito e auditável; soft delete só quando a UX exigir remoção da lista sem perder trilha.

## Entidades iniciais

| Entidade | Campos essenciais | Regras |
| --- | --- | --- |
| `matters` | `tenant_id`, `matter_id`, `title`, `status`, `description?`, timestamps, `deleted_at?`, ator criador/atualizador | Pasta de trabalho para agrupar um ou mais processos; estado ativo/arquivado. |
| `court_cases` | `tenant_id`, `case_id`, `matter_id?`, `court_name`, `jurisdiction?`, `case_number?`, `label?`, `status`, timestamps, `deleted_at?`, atores | Caso processual manual. Número opcional no MVP, nunca usado como ID. `court_name`/UF devem ser campos estruturados e fáceis de corrigir. |
| `tasks` | `tenant_id`, `task_id`, `matter_id?`, `title`, `notes?`, `status`, `scheduled_for?`, timestamps, `deleted_at?`, atores | A implementação atual não tem vínculo com `case_id` nem timezone na tarefa. Estado `todo/in_progress/done/cancelled`; agendamento é organização da rotina, não prazo jurídico. |
| `appointments` | `tenant_id`, `appointment_id`, vínculos opcionais, `title`, `starts_at`, `ends_at`, `timezone`, `location?`, `notes?`, `status`, timestamps, `deleted_at?`, atores | `ends_at > starts_at`; timezone IANA obrigatória; reunião/audiência manual, sem presumir confirmação judicial. |
| `financial_entries` | `tenant_id`, `entry_id`, vínculos opcionais, `kind`, `description`, `amount_cents`, `currency`, `status`, `due_on?`, `occurred_at?`, `timezone?`, `category?`, timestamps, `deleted_at?`, atores | `kind: income/expense`; `amount_cents > 0`; `currency: BRL`; status `planned/paid/cancelled`. Distinguir previsto, pago e cancelado. |
| `legal_researches` | `tenant_id`, `research_id`, `query`, `court_id`, `source_url`, `created_at`, criador | Consulta genérica, tribunal em catálogo fechado e URL derivada no servidor. Não inclui resultados/ementas nem aceita URL fornecida pelo cliente. |
| `audit_events` | `tenant_id`, `event_id`, ator, `entity_type`, `entity_id`, ação, instante, `request_id`, metadados minimizados | Append-only lógico. Registrar criação, edição, arquivamento/cancelamento e mudança de estado; não gravar payload jurídico completo. |
| `legal_research_audit_events` | `tenant_id`, evento, pesquisa, ator, ação, instante e `request_id` | Registro separado porque a enumeração original `audit_events.entity_type` é fechada; criação é registrada em batch junto à busca. |

Adicionar `CHECK` para enumerações, valores positivos seguros e intervalos de horário. Relações de domínio usam `ON DELETE RESTRICT`; associações de tenant/membership e autoria devem referenciar o usuário autenticado por FK composta. Não apagar tenant/usuário em cascata levando dados do escritório.

## Índices

- `matters(tenant_id, status, updated_at)`.
- `court_cases(tenant_id, matter_id, status)`; índice único parcial por tenant para CNJ só depois de normalização e decisão sobre processos sigilosos/repetidos.
- `tasks(tenant_id, status, scheduled_for)` e `(tenant_id, matter_id, status)`.
- `appointments(tenant_id, starts_at, status)`.
- `financial_entries(tenant_id, kind, status, due_on)` e `(tenant_id, occurred_at)`.
- `audit_events(tenant_id, created_at)` e `(tenant_id, entity_type, entity_id, created_at)`.

Listas comuns sempre filtram `tenant_id` derivado da sessão e `deleted_at IS NULL`; usar cursor estável por `created_at/id` ou `updated_at/id`, nunca offset sem limite.

## API e estado dos endpoints

- `GET/POST /api/matters` e `POST /api/matters/:id/archive`.
- `GET/POST /api/court-cases` e `POST /api/court-cases/:id/archive`.
- `GET/POST /api/tasks` e `POST /api/tasks/:id/status`.
- `GET/POST /api/appointments` e `POST /api/appointments/:id/cancel` ou `/status`.
- `GET/POST /api/financial-entries` e `POST /api/financial-entries/:id/cancel` ou `/status`.
- `GET/POST /api/legal-researches`; a criação limita o tribunal aos IDs do catálogo e grava URL oficial fixa no backend.
- As escritas criam eventos de auditoria atômicos junto com dados/status usando D1 `batch()`. Não existe endpoint para consultar eventos.

Request/response usam schemas estritos de `packages/contracts`. Derivar tenant e usuário da sessão; o teste tenta injetar `tenantId` no corpo e é rejeitado. As listas têm limite fixo de 100. **Fora do escopo implementado:** PATCH genérico, paginação cursor, idempotência HTTP, restauração, soft delete acessível, CRUD completo e suíte de teste multi-tenant com duas contas.

## Evidências sintéticas observadas

- [x] Web E2E atual configura o owner, cria assunto/caso/tarefa/compromisso/receitas e despesas, valida datas vencidas/hoje/futuras, muda status, salva pesquisa, copia termos e abre fonte oficial, testa signup público desabilitado e sessão ausente, tenta forjar `tenantId`, recarrega persistência e captura viewports desktop/tablet/mobile; 3/3 projetos Chromium passaram em 17/11.
- [ ] Repetir Android Maestro na versão atual da UX no runner hospedado: a execução anterior passou antes das alterações recentes; o emulador Linux local sem `/dev/kvm` entrou em ANR do System UI. D1/fixtures são descartáveis e o fluxo não simula consulta judicial.
- [x] As telas dizem que o processo foi cadastrado sem consulta a tribunal; tarefa é descrita como organização, não prazo judicial.
- [ ] Testar dois tenants reais sintéticos e todos os caminhos de leitura/escrita/associação/status entre eles antes do piloto.
- [ ] Validar casos-limite monetários, fuso, datas, status e rollback da auditoria por testes de contrato/integração.
- [x] Cadastro manual de compromissos, mudança de status financeiro e busca guiada/salva foram incluídos na UI; confirmar usabilidade com Márcia.
- [ ] Completar CRUD/paginação/idempotência e calendário mensal conforme a Márcia validar a prioridade.
- [ ] Executar iOS smoke no runner macOS; a jornada persistente completa continua Web e aguarda validação Android hospedada nesta etapa.

## Compatibilidade com migrações existentes

`0001_initial_schema.sql` criou uma tabela `cases` provisória e tabelas de identidade iniciais. Não alterar uma migration depois de aplicada. Antes de nomear a migration de domínio, conferir a migration de auth recém-criada e o estado efetivo de D1 local; preferir `court_cases` para não colidir com a tabela provisória. Se houver renomeação/compatibilidade, fazer migration nova e validar desde banco vazio e do estado anterior.

## Perguntas que não bloqueiam esta fatia

Categorias e nomes finais do financeiro, necessidade de parcelas/recorrência e relatórios simples devem ser validados com Márcia; iniciar com categorias livres e sem parcelas. Questões contábeis/fiscais e integração bancária permanecem fora do MVP inicial.
