# Cine Infor

Site de pedidos para o cinema escolar, com pagamento Pix confirmado manualmente.

## Estrutura

- `index.html`, `style.css` e `script.js`: frontend existente.
- `apps-script/Code.gs`: backend seguro para Google Apps Script.
- `apps-script/appsscript.json`: manifesto do Apps Script.
- `apps-script/README.md`: instalação, propriedades e implantação.
- `docs/SEGURANCA.md`: modelo de segurança e roteiro de testes.
- `tests/apps-script-security.test.js`: testes automatizados das validações críticas.

O HTML não foi alterado. Antes de aceitar pagamentos reais, a integração do frontend precisa ser autorizada e concluída conforme `apps-script/README.md`.
