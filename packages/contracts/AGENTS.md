# Contratos compartilhados

- Leia o plano mestre e `docs/plano/03_ARQUITETURA_IA_CLOUDFLARE.md` antes de mudar a fronteira API/app.
- Mantenha schemas Zod como fonte dos tipos (`z.infer`); contratos devem funcionar sem APIs de Node, React, Expo, banco ou Cloudflare.
- Preserve validação estrita, dinheiro em centavos inteiros seguros, datas com fuso, `tenantId`, proveniência explícita e revisão humana. Não introduza confirmação jurídica nem cálculo de prazo.
- Use somente exemplos inventados e identificadores claramente demonstrativos. Nunca copie ZIPs, PII, números CNJ plausíveis, documentos, tokens ou claims de fontes reais.
- Schema não substitui autenticação, autorização, auditoria nem verificação de fonte. Mudanças de contratos exigem revisão dos consumidores e registro das limitações.
- Não execute instalação, altere workspace/lockfile ou edite consumidores como efeito implícito de uma tarefa limitada a este pacote. Coordene essas mudanças com o responsável pela integração.
