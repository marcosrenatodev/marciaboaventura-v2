# Instruções de retomada para IA

- Leia `CURRENT_STATE.md` primeiro para localizar a execução; depois siga os links para as fontes canônicas em `docs/PLANO_EXECUCAO_MARCIA.md` e `docs/plano/`.
- O plano mestre contém decisões, pesquisa, histórico e tarefas. O checkpoint deve resumir apenas o estado mais recente, verificações reais e próxima ação.
- Ao encerrar uma fatia, atualize o plano mestre e `CURRENT_STATE.md` com data, arquivos alterados, comandos executados, resultados, limitações e próximo comando/ação.
- Nunca copie dados dos ZIPs jurídicos, credenciais, nomes de clientes, números CNJ reais ou documentos para código, fixtures, logs ou este diretório. Use dados sintéticos.
- O site público em `src/` e `/escritorio` deve permanecer isolado do app privado em `apps/`.
- iOS está adiado pelo usuário até uma sessão que ele escolher manualmente. Não inicie testes iOS nem `all` antes disso.
- Não faça push, deploy ou GitHub Actions durante a implementação sem autorização aplicável; considere o custo operacional e as regras registradas no plano.
