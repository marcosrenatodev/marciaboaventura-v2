# Instruções para `scripts/`

- Mantenha aqui scripts pequenos, revisáveis e reutilizáveis; não deixe scripts de retomada em `/tmp`.
- E2E local deve usar dados sintéticos, D1/R2 descartáveis e serviços limitados a loopback.
- Nunca grave credenciais, conteúdo dos ZIPs ou dados reais nos scripts ou em seus outputs.
- Não crie comandos que façam deploy, push ou iniciem GitHub Actions automaticamente.
- Envie screenshots, traces e outros artefatos descartáveis para diretórios ignorados; deixe no Git apenas o script que os produz.
