# Segurança e revisão antes da publicação

## O que esta implementação protege

- Planilha privada, acessada pelo site somente por meio do Apps Script.
- Acesso do comprador limitado à criação e à consulta protegida do próprio pedido.
- Posse do e-mail institucional confirmada por um código temporário enviado ao endereço informado.
- Domínio institucional comparado de forma exata.
- Código de seis dígitos com expiração, limite de tentativas e intervalo de reenvio.
- Contador de tentativas protegido por lock contra verificações simultâneas.
- Limites de e-mail por endereço, por hora, por dia e reserva da cota do MailApp.
- Sessão temporária armazenada no cache do servidor e identificada por token aleatório.
- Consulta de status exige o ID e um token específico do pedido; o token é armazenado somente como HMAC na planilha.
- Campos desconhecidos, incluindo `status`, são rejeitados.
- Preços, quantidade de ingressos e total recalculados e validados no servidor em centavos.
- IDs de pedidos aleatórios gerados no servidor.
- Limite de pedidos por conta e janela de deduplicação.
- Bloqueio de concorrência durante gravações.
- Textos neutralizados antes de entrar no Sheets, evitando fórmulas injetadas.
- Fluxo de status restrito a `Aguardando -> Pago -> Utilizado`.
- Estado canônico protegido, usado para restaurar alterações ou colagens inválidas.
- Registro de data, hora e conta responsável por mudanças de status.
- Falhas internas não expõem rastros, IDs da planilha ou configurações ao cliente.
- Nenhuma função de administração está publicada na web.
- PDF emitido pelo servidor somente após o estado canônico chegar a `Pago`.
- Código de validação do ticket assinado com HMAC e registrado na planilha.
- Consulta automática limitada a uma vez por minuto e pausada em abas ocultas.
- Biblioteca de QR Code hospedada no próprio projeto; a antiga dependência de PDF no navegador foi removida.

## DevTools e console do Chrome

Nenhum site consegue impedir totalmente que o visitante abra o DevTools, leia arquivos enviados ao navegador ou crie uma requisição manual. Desabilitar clique direito, detectar `F12` ou ofuscar JavaScript dá apenas uma falsa sensação de segurança e prejudica acessibilidade.

A defesa aplicada aqui é do lado servidor: mesmo com a URL conhecida e o JavaScript completamente alterado, o solicitante não consegue definir preço, ID, status, pagamento ou utilização. A URL do Apps Script não é tratada como segredo.

## Pontos que continuam dependendo de configuração humana

- O servidor de e-mail institucional precisa aceitar as mensagens enviadas pela conta responsável pelo Apps Script.
- A implantação precisa executar como a conta responsável e aceitar acesso público; códigos, sessões e tokens fazem a autorização das operações.
- `ALLOWED_ORIGINS` deve conter somente as origens em que o site oficial é publicado.
- A planilha precisa continuar com acesso geral `Restrito`.
- `ADMIN_EMAILS` deve conter somente organizadores ativos.
- A conta pessoal responsável pelo Apps Script e pela planilha deve ter 2FA.
- As cotas de envio de e-mail e execução do Apps Script devem ser testadas com o público esperado.
- Um PDF nunca deve ser aceito sozinho: `PEDIDO_ID`, `Pago` e `CODIGO_VALIDACAO_TICKET` precisam coincidir na planilha.
- O responsável precisa revisar permissões quando alguém sair da organização.
- Backups devem ser feitos antes do evento e antes de mudanças importantes.
- O extrato bancário é a fonte da confirmação do Pix, não o comprovante apresentado.

## Erros para procurar nos testes posteriores

1. Enviar `status: "Pago"`, `status: "Utilizado"` ou qualquer campo inesperado.
2. Alterar no console os preços, quantidades e o total enviado.
3. Enviar zero, quantidade negativa, decimal, texto ou mais de 10 ingressos.
4. Enviar quantidade de pipocas negativa, decimal, maior que quatro ou incompatível com os tipos.
5. Enviar `querPipoca: false` junto com tipos de pipoca.
6. Enviar strings como `"false"` no lugar de booleanos reais.
7. Usar uma turma inexistente ou modificar o texto de uma turma no navegador.
8. Usar nomes começando com `=`, `+`, `-` ou `@`, tags HTML, controles ou texto muito longo.
9. Mandar JSON inválido, array no lugar de objeto, corpo vazio ou corpo acima de 4 KB.
10. Repetir rapidamente o mesmo pedido e confirmar que não são criadas duplicatas acidentais.
11. Tentar mais pedidos por hora do que o limite configurado.
12. Tentar confirmar usando Gmail pessoal ou conta de outro domínio.
13. Tentar um domínio enganoso, como `escola.edu.br.exemplo.com`.
14. Abrir a URL do Web App por `GET` e confirmar que nenhum pedido ou dado é exibido.
15. Procurar no código público por ID da planilha, lista de administradores ou segredos.
16. Tentar acessar a planilha com uma conta de aluno ou em janela anônima.
17. Tentar alterar `Aguardando` diretamente para `Utilizado`.
18. Tentar voltar `Pago` para `Aguardando` ou `Utilizado` para `Pago`.
19. Tentar mudar status com um editor não listado em `ADMIN_EMAILS`.
20. Colar status em várias linhas ao mesmo tempo e verificar o bloqueio.
21. Fazer duas tentativas de uso do mesmo ingresso quase simultaneamente.
22. Remover um administrador e confirmar que ele perde acesso ao Drive e às alterações.
23. Induzir um erro do servidor e verificar que a resposta não contém stack trace ou configuração.
24. Conferir se o total do backend é idêntico ao valor mostrado no QR Pix.
25. Confirmar que um erro do backend não aparece como “Pedido enviado com sucesso” no site.
26. Testar cotas e comportamento sob muitas requisições antes do dia do evento.
27. Confirmar que `vendor/qrcode.min.js` é servido pelo próprio site e que a política `CSP` continua ativa.
28. Confirmar que o e-mail do autor aparece no gatilho de edição do Workspace; se o Google não o fornecer, a alteração deve falhar fechada.
29. Tentar consultar um pedido sem token, com token de outro pedido e com ID inexistente.
30. Errar o código de e-mail cinco vezes e confirmar o bloqueio.
31. Confirmar que a página continua em `Aguardando confirmação` até um responsável marcar `Pago`.
32. Tentar solicitar o PDF de um pedido `Aguardando` e confirmar que o servidor recusa.
33. Comparar o código do PDF com `CODIGO_VALIDACAO_TICKET` e recusar qualquer divergência.
34. Marcar o pedido `Utilizado` e confirmar que uma nova emissão é recusada.
35. Confirmar que o limite diário de códigos preserva a reserva de e-mails configurada.
