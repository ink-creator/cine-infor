# Cine Infor

Site de pedidos para o cinema escolar, com acesso por e-mail institucional e pagamento Pix confirmado manualmente.

## Fluxo

1. O aluno confirma o e-mail institucional com um código.
2. O backend cria o pedido e devolve o QR Pix.
3. A página mostra `Aguardando confirmação`.
4. Um responsável confere o extrato e marca o pedido como `Pago`.
5. A página mostra `Pagamento confirmado` e o servidor emite um PDF com código de validação.
6. Após baixar o ticket, o comprador pode iniciar outro pedido com a mesma sessão de e-mail.

Cada pedido aceita de 1 a 10 ingressos. O valor é multiplicado e validado no servidor. A página também mostra um contato de WhatsApp para solicitações de reembolso.

## Estrutura

- `index.html`, `style.css` e `script.js`: frontend usado pelo site.
- `vendor/qrcode.min.js`: gerador de QR Code hospedado no próprio projeto.
- `apps-script/Code.gs`: backend seguro para Google Apps Script.
- `apps-script/appsscript.json`: manifesto do Apps Script.
- `GUIA_CONFIGURACAO.md`: passo a passo completo de instalação e operação.
- `apps-script/README.md`: resumo técnico do backend.
- `docs/SEGURANCA.md`: modelo de segurança e roteiro de testes.
- `tests/apps-script-security.test.js`: testes automatizados das validações críticas.

Comece pelo [guia de configuração](GUIA_CONFIGURACAO.md). Antes de aceitar pagamentos reais, faça o teste completo descrito no guia.
