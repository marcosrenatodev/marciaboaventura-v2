# Runbook — incidente e recuperação D1/R2

**Estado: RASCUNHO — NÃO EXECUTAR EM PRODUÇÃO.** Este procedimento documenta decisões e gates; não habilita nem valida recursos remotos. O checkout atual ainda usa `remote: false`, ID D1 placeholder e sem R2 remoto. Há um controle de manutenção no código local (`SERVICE_MODE=maintenance`) que responde antes de D1/R2; ele ainda precisa de E2E, configuração no ambiente remoto e ensaio operacional. Não há chave de documentos versionada com recuperação testada nem retenção aprovada. Pare antes de qualquer operação remota ou destrutiva até todos os gates da seção 8 serem fechados.

Última revisão documental: 18/11/2026. Escopo: recuperação de metadados no Cloudflare D1 e arquivos cifrados no R2. Não é plano de resposta jurídica, parecer de conformidade, nem garantia de prazo judicial.

## 1. Objetivo e limites

Recuperar o serviço sem agravar perda de dados, mantendo o vínculo entre cada registro D1 e seu objeto cifrado R2. Trate D1 + R2 + versão correta da chave AES-GCM como um conjunto. Restaurar somente o banco, bucket ou segredo não garante recuperação.

O D1 Time Travel pode restaurar um bookmark no lugar e sobrescreve o banco atual; não é ensaio para produção. A documentação atual indica retenção de 7 dias no Workers Free e 30 dias no Paid e exige backend `production`. A restauração interrompe queries/transações em andamento. Confira a documentação oficial antes de cada uso, pois limites podem mudar: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) e [comandos D1 do Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/) (consultados em 18/11/2026).

Exportações também podem afetar a disponibilidade. A API de exportação informa que a base pode ficar indisponível durante o export; é necessário acompanhar o job até estado final e não expor a URL assinada. Use a documentação atual de [importação/exportação D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/) e da [API de exportação](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) antes de configurar o processo. O exemplo oficial de [backup de D1 com Workflows](https://developers.cloudflare.com/workflows/examples/backup-d1/) é referência, não prova de que o fluxo do escritório esteja implantado ou dimensionado.

## 2. Papéis e registro do incidente

- **Responsável pelo incidente:** mantém a linha do tempo e decide pausa, comunicação e encerramento.
- **Operador Cloudflare:** identifica a conta/ambiente, coleta bookmarks e executa comandos somente após aprovação.
- **Aprovador do escritório:** Márcia ou pessoa por ela delegada confirma o escopo e o impacto. Restauração in-place exige uma segunda pessoa revisora quando disponível.
- Registre ID interno do incidente, horário UTC, recurso/ambiente opaco, sintomas, decisões e referências às evidências restritas. Não copie conteúdo de processo, PDFs, nomes de partes, CNJ, tokens, URLs assinadas ou chaves para o ticket, terminal compartilhado ou este repositório.
- Fixar antes de qualquer ação: quem aprova, janela de manutenção, sistema de comunicação e canal seguro para valores de bookmark e evidência. Não assumir que parâmetros locais identificam a conta certa.

## 3. Triagem e contenção

1. Abra um incidente e registre o primeiro horário conhecido do problema, o horário de detecção e a última operação que parece correta.
2. Classifique sem alterar estado:
   - indisponibilidade sem evidência de corrupção;
   - alteração/exclusão lógica em D1;
   - PDF primário ausente ou com hash inválido;
   - primário e cópia R2 indisponíveis/corrompidos;
   - chave de cifra ausente, incorreta ou de versão desconhecida;
   - credencial/conta Cloudflare comprometida.
3. Preserve logs mínimos e IDs de requisição com acesso restrito; confirme se alertas ou retries podem repetir a falha. Não repita upload/import/reprocessamento às cegas.
4. Não rode migrations, importações, limpeza, lifecycle, `wrangler d1 time-travel restore`, troca de chave, exclusão de bucket ou restauração em massa durante a triagem.
5. Se houver suspeita de comprometimento de credencial, use o runbook específico de credenciais após este documento ser completado; revogue por canal administrativo aprovado, rode análise de impacto e preserve trilha. Esse procedimento ainda não existe.

## 4. Escolha do caminho de recuperação

| Sintoma observado | Caminho | Condição de parada |
| --- | --- | --- |
| D1 indisponível, sem corrupção confirmada | Diagnosticar serviço e configuração | Não restaurar só por timeout; preservar estado e obter evidência do provedor. |
| Registros D1 alterados/excluídos por erro recente | Avaliar bookmark Time Travel | Não prosseguir sem backend `production`, horário de corte, congelamento de escritas, export prévio viável e aprovação. |
| PDF primário ausente/adulterado, cópia íntegra | Recuperação por documento já implementada localmente | A E2E local comprovou fallback, verificação, tentativa de reparo e auditoria; produção não está configurada. Se a rota responder `503`, parar e preservar os objetos. |
| Primário e cópia R2 ausentes/adulterados | Recuperação a partir de cópia independente/manifesto | Não marcar documento como `ready`, não gerar objeto vazio e não inventar metadados. Evidência atual é só local sintética; procedimento de restauração em lote ainda falta. |
| Chave ausente/incorreta ou versão desconhecida | Recuperação controlada da chave correspondente | **Parar.** A API falha fechada. Não gerar chave nova, desativar cifra, regravar ciphertext nem substituir segredo em produção. O escrow/rotação versionada ainda não está implementado. |
| Perda/comprometimento de conta Cloudflare | Escalonar para resposta de segurança | Dois buckets na mesma conta não são fronteira independente; cópia separada/offline e plano de identidade ainda não foram validados. |

## 5. Recuperação D1 por Time Travel — gate futuro

Os comandos abaixo são modelos documentais com placeholders. **Não os execute neste checkout nem contra produção:** configuração atual é local e o nome/ID remoto não foi provisionado. Após fechar a seção 8, executar em sessão administrativa dedicada, confirmar conta/ambiente e obter revisão do aprovador.

1. Confirme a conta e o banco alvo usando procedimento administrativo independente. Verifique `version: production` com `wrangler d1 info <DB_NAME>` e leia a referência oficial de [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). Se backend, conta, banco ou versão não corresponderem, pare.
2. Identifique a última operação correta e escolha um instante anterior ao erro. Consulte bookmark atual e, se necessário, o bookmark para o timestamp desejado, usando a sintaxe documentada para a versão instalada do Wrangler. Anote valores apenas no registro restrito do incidente; bookmarks não são segredo, mas evidência operacional sensível.
3. Quantifique e comunique impacto esperado. Configure `SERVICE_MODE=maintenance` no ambiente correto pelo procedimento de mudança revisado; aguarde a propagação completa e a janela de drenagem de requests em andamento. Confirme `/health` com `maintenanceMode: true` e prove em ensaio descartável que `/api/**` devolve `503` + `Retry-After` sem acessar D1/R2. **Até esse E2E, propagação, drenagem e rollback serem ensaiados, pare aqui.** O controle só bloqueia o Worker/API; não pausa workflows, cron jobs, webhooks externos ou a hospedagem Pages. Não existem handlers `scheduled`/`queue` no Worker atual, mas qualquer integração futura precisa ser adicionada ao controle de pausa antes de ativação.
4. Com o tráfego de escrita efetivamente suspenso, exporte/registre o estado pré-restauração para armazenamento restrito e aprovado. Faça polling do export até concluir ou falhar; não cole SQL, URL assinada ou resposta da API em logs. Se não houver export verificável ou ele ameaçar disponibilidade além da janela aprovada, pare e replaneje.
5. A segunda pessoa revisora confere conta, nome do banco, bookmark, instante UTC, export prévio, janela, impacto e plano de retorno. Aprovador registra autorização explícita.
6. Restaure o bookmark aprovado usando a versão atual documentada do comando `wrangler d1 time-travel restore <DB_NAME> --bookmark=<BOOKMARK>`. É uma operação in-place. Guarde com segurança o bookmark anterior informado pelo procedimento para a possibilidade de desfazer a restauração. Não use um comando cuja sintaxe/saída não tenha sido confirmada na documentação vigente.
7. Mantenha o app em manutenção. Valide integridade e compatibilidade do schema sem expor linhas jurídicas; reconcilie documentos com os objetos R2 e a chave correta (seção 6). Só então a pessoa responsável pode liberar tráfego gradualmente.
8. Se a validação falhar, mantenha manutenção, preserve a evidência e submeta rollback a nova aprovação. O bookmark anterior pode permitir desfazer o Time Travel, mas rollback também sobrescreve dados; nunca o automatize ou execute sem conferir o estado resultante.

Não aplique migrations automaticamente para “corrigir” uma restauração. Primeiro compare migrations disponíveis, versão recuperada do schema e código que será liberado; incompatibilidade bloqueia reabertura até plano de rollout/rollback revisado.

## 6. R2, documentos e segredo de cifra

- Para falha isolada de um documento, a rota atual tenta validar a cópia de backup, descriptografar e verificar o plaintext, reparar o primário e registrar resultado sem conteúdo. A E2E local comprovou esses caminhos com dados sintéticos; ela não prova existência de bucket remoto, cobertura de objetos antigos ou operação real.
- Se a API retornar `503`, não ofereça um link alternativo, não exponha ciphertext e não sinalize restauração como concluída. Preserve ambos os objetos e os eventos de recuperação para análise.
- Uma restauração D1 pode fazer registros voltarem a apontar para objetos R2 criados depois do bookmark ou deixar objetos sem referência. Não apague objetos “órfãos” automaticamente. Gere uma lista restrita de referências ausentes/excedentes por chave opaca e reconcilie com manifesto aprovado, sem listar nomes jurídicos ou conteúdo.
- Para recuperação em lote, validar antes de marcar `ready`: chave/versão correspondente; bucket e object key esperados; tamanho e hash do ciphertext; autenticação AES-GCM com AAD esperado; tamanho/hash do plaintext comparado ao D1; integridade do registro e presença da cópia. Falha em qualquer controle mantém o item inacessível e abre subtarefa.
- A chave `DOCUMENTS_ENCRYPTION_KEY` ainda não possui escrow/rotação versionada comprovados. Sem recuperar a versão exata por canal seguro, **pare e mantenha os PDFs fechados**. Nunca registre, comite, envie por e-mail/chat ou coloque a chave ao lado do dump/R2.
- R2 Bucket Locks podem impedir overwrite/deleção e prevalecem sobre lifecycle; uma regra rígida pode tornar dados impossíveis de apagar. Não habilite retenção até prazo, expurgo legal, restauração e exceções de incidentes serem aprovados e testados em bucket descartável. Fonte: [R2 Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) (consultada em 18/11/2026).

## 7. Validação, retomada e encerramento

Antes de retirar manutenção, o responsável registra resultado de cada item:

- identidade do recurso/ambiente conferida por duas pessoas; hora UTC e bookmark usados preservados;
- healthcheck e login de conta sintética/operacional aprovados; logs sem payload jurídico;
- schema e migrations compatíveis; checagens `integrity_check` e `foreign_key_check` sem erro, executadas por operador autorizado;
- contagens agregadas e consistência de tenant/documento revisadas sem expor linhas, nomes ou números CNJ;
- um documento sintético de canário pode ser cifrado/decifrado e baixado; para acervo real, amostra aprovada é validada sem copiar/baixar conteúdo para evidência;
- cada documento ativo/arquivado continua apontando a objeto recuperável e chave correta; falhas permanecem indisponíveis, nunca `ready`;
- ingestão de jobs/webhooks foi retomada sem duplicação e os eventos pendentes foram reconciliados;
- conta de monitoramento acompanha erros, backlog, R2/D1 e orçamento; aviso de status foi enviado no canal aprovado;
- plano de rollback não foi necessário ou foi executado mediante aprovação; causa raiz, impacto e ações corretivas têm responsáveis e datas.

Encerre só após a pessoa responsável e a aprovadora aceitarem a evidência. Produza uma revisão pós-incidente sem dados jurídicos e transforme lacunas em tarefas rastreáveis. Não declare RPO/RTO cumpridos: esses valores ainda não foram aprovados ou medidos.

## 8. Gates para tornar este runbook executável

Todos são pré-condições, não passos opcionais:

1. Provisionar D1/R2 corretos em ambiente separado, confirmar backend Time Travel `production`, bindings, IAM mínimo, domínio TLS e observabilidade; manter local/dev isolados.
2. O Worker tem `SERVICE_MODE=maintenance`, que bloqueia `/api/**` e fixtures locais com `503` antes de autenticação/D1/R2; `/health` permanece liveness-only e informa `maintenanceMode`. Falta provar E2E e execução operacional no ambiente remoto: alteração versionada, propagação, drenagem de requests, bloqueio de todas as rotas/métodos, rollback e confirmação de que não há cron/workflow/webhook ativo fora do Worker. O controle atual é pausa total da API, não modo read-only, e não interrompe a hospedagem Pages.
3. Projetar chave de documentos versionada, escrow fora da conta/bucket de backup, controle de acesso/MFA, rotação e recuperação; demonstrar descriptografia cruzada de todas as versões em ambiente sintético.
4. Aprovar RPO, RTO, janela máxima de indisponibilidade, cadência/custo de export, volume e retenção com Márcia; alertas de orçamento e falhas precisam funcionar.
5. Definir backup D1 independente e completo, manifesto coordenado D1/R2/chave, retenção e isolamento de conta; testar lifecycle/lock em bucket descartável sem risco de retenção eterna.
6. Implementar reconciliação e restauração em lote idempotentes com dry-run, relatório de referências, proteção contra órfãos, auditoria e rollback. O fallback unitário atual não supre isso.
7. Completar runbooks ligados: comprometimento/rotação de credenciais, indisponibilidade de provedor, reprocessamento/DLQ e comunicação de incidente.
8. Fazer simulado ponta a ponta em conta/projeto descartável, incluindo Time Travel (somente com banco descartável compatível), perda/corrupção de ambos os objetos, chave indisponível, falha parcial e rollback. Aprovação humana de segurança e privacidade antes de dados reais.

## 9. Evidência existente no projeto

Em 18/11/2026, `pnpm backup:drill` passou localmente com Wrangler `remote:false`, 28 migrations e fixture sintética: export/import D1 em estados separados, dois objetos R2, manifesto, hashes, AES-GCM byte a byte, `integrity_check=ok`, `foreign_key_check` vazio, rejeição de SQL truncado sem tabelas parciais e recusa de chave ausente/incorreta. A E2E renderizada também confirmou resposta HTTP `503` sem PDF para chave ausente/incorreta e fallback/reparo ou falha fechada para objetos sintéticos. Isso valida o código local coberto, não uma conta Cloudflare remota, Time Travel, retenção, chave real, custo ou procedimento de operador.

Para o ponto de retomada e arquivos de evidência sem conteúdo legal, consulte [o checkpoint](../ai/CURRENT_STATE.md) e a [seção 6 do plano de segurança](../plano/04_SEGURANCA_CI_TESTES_OPERACAO.md#6-incidente-backup-e-continuidade). Não manter dumps, manifestos com identificadores de produção, traces ou PDFs neste repositório.
