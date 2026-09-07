# Backend do Cine Infor — Google Apps Script

O backend pode ser implantado por uma conta Google pessoal e acessa uma planilha privada dessa conta. A identidade do comprador não depende da sessão Google do Apps Script: o sistema envia um código ao e-mail institucional e cria uma sessão temporária somente depois da confirmação.

O passo a passo completo está em [`../GUIA_CONFIGURACAO.md`](../GUIA_CONFIGURACAO.md).

## Ações públicas controladas

O único endpoint HTTP de operação é `doPost()`. Ele recebe uma das ações abaixo:

| Ação | Proteção | Resultado |
|---|---|---|
| `getPublicConfig` | Somente preços públicos | Preços oficiais para atualizar a página |
| `requestVerification` | Domínio exato e limite de reenvio | Envia código ao e-mail institucional |
| `verifyEmail` | Código temporário e limite de tentativas | Cria sessão temporária do comprador |
| `createOrder` | Sessão institucional válida e quantidade de 1 a 10 ingressos | Recalcula o total, grava o pedido e devolve Pix/token de status |
| `getOrderStatus` | ID e token aleatório do pedido | Devolve somente status e horários daquele pedido |
| `issueTicket` | ID, token do pedido e status confirmado como `Pago` | Emite o PDF no servidor e grava o código de validação |

Não há listagem pública, busca por e-mail, alteração de status, exclusão ou administração pela Web. `doGet()` continua sem fornecer dados.

## Propriedades

| Propriedade | Finalidade |
|---|---|
| `SPREADSHEET_ID` | Planilha privada |
| `INSTITUTIONAL_DOMAIN` | Domínio educacional aceito |
| `ALLOWED_ORIGINS` | Sites autorizados a receber respostas |
| `ADMIN_EMAILS` | Responsáveis que podem mudar status |
| `MAX_ORDERS_PER_EMAIL_PER_HOUR` | Limite por comprador |
| `MAX_VERIFICATION_EMAILS_PER_ADDRESS_PER_HOUR` | Limite de códigos por endereço/hora (padrão: 3) |
| `MAX_VERIFICATION_EMAILS_PER_ADDRESS_PER_DAY` | Limite de códigos por endereço/dia (padrão: 5) |
| `MAX_VERIFICATION_EMAILS_PER_HOUR` | Limite global por hora (padrão: 40) |
| `MAX_VERIFICATION_EMAILS_PER_DAY` | Limite global por dia (padrão: 80) |
| `MIN_REMAINING_EMAIL_QUOTA` | Reserva da cota do MailApp (padrão: 10) |
| `PIX_KEY` | Chave Pix |
| `PIX_RECEIVER_NAME` | Nome no Pix |
| `PIX_CITY` | Cidade no Pix |
| `AUTH_SECRET` | Gerada automaticamente por `configurarProjeto()` |

## Operação

- Todo pedido nasce como `Aguardando`.
- O QR e o total são gerados a partir dos valores do servidor.
- O responsável confirma o crédito no extrato e altera `STATUS` para `Pago`.
- O navegador consulta o status usando um token específico do pedido.
- O PDF só é emitido pelo servidor quando o estado canônico é `Pago` e inclui um código HMAC armazenado na planilha.
- Somente `Aguardando -> Pago -> Utilizado` é aceito.
- Alterações inválidas são revertidas e auditadas.

Este fluxo não é uma confirmação Pix automática. Para isso seria necessária uma cobrança dinâmica e um webhook oferecido pelo banco ou intermediador.
