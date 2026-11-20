# Regras para runbooks

- Escreva em português claro, com estado, escopo, responsável, pré-condições, passos, validação, rollback e critérios de parada.
- Marque comandos remotos ou destrutivos como não executáveis até os gates do plano estarem cumpridos; use placeholders, nunca nomes/IDs ou segredos reais.
- Não inclua dados de clientes, números de processo, conteúdo jurídico, URLs assinadas, tokens ou chaves.
- Diferencie comportamento implementado localmente de capacidade configurada e comprovada em produção.
- Todo procedimento deve preservar evidência mínima sem registrar conteúdo jurídico e exigir aprovação humana para mudanças irreversíveis.
