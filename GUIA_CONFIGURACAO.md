# Guia de configuração do Cine Infor

Este guia prepara o sistema para o seguinte fluxo:

```text
aluno confirma o e-mail institucional
        ↓
faz o pedido e recebe o QR Pix
        ↓
paga e vê "Aguardando confirmação"
        ↓
responsável confere o extrato e marca "Pago" na planilha
        ↓
aluno vê "Pagamento confirmado" e solicita o PDF seguro ao servidor
```

O Pix não é confirmado automaticamente pelo banco. A confirmação é feita por um responsável depois de conferir o recebimento no extrato.

## Estrutura

- `index.html`: estrutura da página e do formulário.
- `script.js`: comunicação com o backend, QR Code e acompanhamento do pagamento.
- `style.css`: aparência da página e dos estados de pagamento.
- `apps-script/Code.gs`: backend, verificação de e-mail, preços, Pix, gravação, consulta protegida e emissão do PDF.
- `apps-script/appsscript.json`: configuração do projeto Apps Script.
- `tests/apps-script-security.test.js`: testes das validações críticas.
- Google Sheets: banco de dados privado dos pedidos.

A planilha e o Apps Script podem pertencer a uma conta Google pessoal. O aluno prova que controla uma conta educacional recebendo um código de seis números no e-mail institucional. O código expira em 10 minutos e a sessão confirmada dura até 6 horas.

## 1. Criar a planilha

1. Entre na conta Google pessoal que será responsável pelo sistema.
2. Crie uma planilha vazia no Google Sheets.
3. Dê um nome como `Cine Infor - Pedidos`.
4. Copie o ID da planilha. Na URL abaixo, o ID é a parte entre `/d/` e `/edit`:

   ```text
   https://docs.google.com/spreadsheets/d/1K6_uX4VPfAn8l_VFvPn5pUC4vgGc8iBnPJG9bVBuByU/edit
   ```

5. Mantenha **Acesso geral: Restrito**.
6. Compartilhe a planilha como editor somente com os responsáveis que confirmarão pagamentos. Alunos não devem receber acesso à planilha.

Não crie colunas ou abas manualmente. O script fará isso na etapa 4.

## 2. Criar o Apps Script

1. Acesse [script.google.com](https://script.google.com) com a conta pessoal responsável.
2. Clique em **Novo projeto**.
3. Dê o nome `Cine Infor Backend`.
4. Apague o conteúdo inicial de `Code.gs`.
5. Copie todo o conteúdo de `apps-script/Code.gs` deste projeto para o `Code.gs` online.
6. Salve o arquivo `Code.gs`. Para este projeto, isso já é suficiente.

### Manifesto `appsscript.json` (opcional)

O Apps Script cria esse arquivo automaticamente, portanto você pode pular esta parte e seguir para a etapa 3.

Se quiser conferir ou copiar o manifesto deste repositório:

1. Na barra lateral esquerda do Apps Script, clique na engrenagem **Configurações do projeto**.
2. Role a página até a seção **Configurações gerais**.
3. Marque **Mostrar o arquivo de manifesto `appsscript.json` no editor**.
4. Volte ao **Editor** usando o ícone `<>` da barra lateral.
5. O arquivo `appsscript.json` aparecerá abaixo de `Code.gs`.
6. Abra-o e copie o conteúdo de `apps-script/appsscript.json` deste projeto.

Se essa opção não aparecer, apenas confirme em **Configurações do projeto** que o ambiente de execução V8 está ativado e continue o guia.

## 3. Configurar as propriedades

No Apps Script, abra **Configurações do projeto > Propriedades do script** e crie:

| Propriedade | Exemplo | Uso |
|---|---|---|
| `SPREADSHEET_ID` | `1AbC...xyz` | ID copiado da URL da planilha |
| `INSTITUTIONAL_DOMAIN` | `aluno.ce.gov.br` | Domínio permitido, sem `@` |
| `ALLOWED_ORIGINS` | `https://ink-creator.github.io` | Origem onde o site está publicado, sem caminho e sem `/` final |
| `ADMIN_EMAILS` | `gugasksk@gmail.com` | Responsáveis autorizados, separados por vírgula |
| `MAX_ORDERS_PER_EMAIL_PER_HOUR` | `5` | Limite de pedidos por aluno por hora |
| `MAX_VERIFICATION_EMAILS_PER_ADDRESS_PER_HOUR` | `3` | Máximo de códigos por endereço em uma hora |
| `MAX_VERIFICATION_EMAILS_PER_ADDRESS_PER_DAY` | `5` | Máximo de códigos por endereço no dia |
| `MAX_VERIFICATION_EMAILS_PER_HOUR` | `40` | Máximo global de códigos em uma hora |
| `MAX_VERIFICATION_EMAILS_PER_DAY` | `80` | Máximo global de códigos no dia |
| `MIN_REMAINING_EMAIL_QUOTA` | `10` | Reserva da cota de e-mail da conta responsável |
| `PIX_KEY` | `pix@exemplo.com` | Chave Pix que receberá os pagamentos |
| `PIX_RECEIVER_NAME` | `CINE INFOR` | Nome do recebedor, até 25 caracteres |
| `PIX_CITY` | `FORTALEZA` | Cidade do recebedor, até 15 caracteres |

Para este repositório no GitHub Pages, a origem normalmente é `https://ink-creator.github.io`, mesmo que o endereço completo da página termine em `/cine-infor/`.

Para testar localmente, podem ser informadas várias origens separadas por vírgula:

```text
https://ink-creator.github.io,http://127.0.0.1:4173
```

Não crie a propriedade `AUTH_SECRET`. A função de configuração gera esse segredo automaticamente. Não publique as propriedades no GitHub.

As cinco propriedades `MAX_VERIFICATION_*` e `MIN_REMAINING_EMAIL_QUOTA` também são criadas com os valores acima quando `configurarProjeto` é executada. Você só precisa criá-las manualmente se quiser trocar os limites antes dessa etapa.

## 4. Preparar a planilha automaticamente

1. No seletor de funções do Apps Script, escolha `configurarProjeto`.
2. Clique em **Executar**.
3. Aceite as permissões solicitadas para Sheets, envio de e-mail e gatilhos.
4. Volte à planilha e confirme que existem as abas `Pedidos_Seguro` e `Auditoria`.

Essa função também:

- cria o segredo usado para proteger códigos e tokens;
- cria e protege as colunas;
- deixa somente a coluna `STATUS` disponível para operação;
- instala o gatilho que valida alterações de status;
- adiciona colunas novas automaticamente caso a planilha tenha sido criada por uma versão anterior, incluindo `CODIGO_VALIDACAO_TICKET`.

Sempre que a estrutura do backend mudar, execute `configurarProjeto` novamente.

## 5. Implantar o backend

1. Clique em **Implantar > Nova implantação**.
2. Escolha **App da Web**.
3. Em **Executar como**, escolha **Eu**, isto é, a conta pessoal responsável.
4. Em **Quem pode acessar**, escolha **Qualquer pessoa**.
5. Clique em **Implantar** e autorize o projeto.
6. Copie a URL terminada em `/exec`.

O acesso público ao endpoint não torna a planilha pública. O backend só aceita pedidos após a confirmação do e-mail institucional e só revela o status de um pedido mediante um token aleatório específico daquele pedido.

Quando alterar `Code.gs`, abra **Implantar > Gerenciar implantações**, edite a implantação e selecione uma nova versão. Assim a URL `/exec` continua a mesma.

## 6. Ligar o site ao backend

Abra `script.js` e procure:

```javascript
const URL_APPS_SCRIPT =
  'COLE_AQUI_A_URL_DO_APPS_SCRIPT';
```

Substitua apenas o texto entre aspas pela URL `/exec` copiada na etapa anterior. Depois publique novamente o site.

O valor de `ALLOWED_ORIGINS` precisa corresponder à origem real da página. Exemplos:

- página `https://ink-creator.github.io/cine-infor/`: origem `https://ink-creator.github.io`;
- página `https://cinema.exemplo.com/pedidos`: origem `https://cinema.exemplo.com`;
- teste `http://127.0.0.1:4173/index.html`: origem `http://127.0.0.1:4173`.

### Publicar pelo GitHub Pages

1. Envie para o GitHub a versão atualizada dos arquivos, incluindo a URL `/exec` no `script.js`.
2. Abra o repositório `ink-creator/cine-infor` no GitHub.
3. Entre em **Settings > Pages**.
4. Em **Build and deployment > Source**, escolha **Deploy from a branch**.
5. Em **Branch**, selecione `main` e a pasta `/(root)`.
6. Clique em **Save** e aguarde a publicação.

O endereço esperado é:

```text
https://ink-creator.github.io/cine-infor/
```

Para esse endereço, configure a propriedade do Apps Script assim, sem o caminho `/cine-infor/`:

```text
ALLOWED_ORIGINS = https://ink-creator.github.io
```

> Atenção: a documentação atual do GitHub informa que Pages não é destinado a sites cuja finalidade principal seja facilitar transações comerciais. Para um evento com vendas reais, confirme se o uso se enquadra nas regras ou publique a parte estática em um serviço apropriado, como Cloudflare Pages. A mudança de hospedagem exige atualizar `ALLOWED_ORIGINS` e a política CSP do `index.html`.

## 7. Onde mudar os preços

Os preços oficiais ficam somente em `apps-script/Code.gs`, dentro de `pricesInCents`:

```javascript
pricesInCents: Object.freeze({
  ticket: 200,
  popcorn: 150,
  soda: 100
})
```

Os números são centavos:

- `200` = R$ 2,00;
- `150` = R$ 1,50;
- `100` = R$ 1,00;
- `300` = R$ 3,00.

Depois de mudar um preço:

1. salve `Code.gs` no Apps Script;
2. crie uma nova versão da implantação;
3. recarregue o site.

O site consulta os preços do backend e atualiza os textos automaticamente. O total do pedido, incluindo a multiplicação pela quantidade de ingressos, também é calculado no servidor, nunca pelo navegador.

## 8. Onde mudar a chave Pix

Altere as propriedades `PIX_KEY`, `PIX_RECEIVER_NAME` e `PIX_CITY` no Apps Script. Não é necessário mexer no `index.html`.

Depois da alteração, não é preciso gerar outra versão do código, pois propriedades são lidas em cada pedido. Faça um pedido de teste e escaneie o QR com um aplicativo bancário para conferir recebedor e valor antes de divulgar o site.

## 9. Como confirmar um pagamento

1. O aluno faz o pedido e paga o QR Pix.
2. A página do aluno permanece em **Aguardando confirmação**.
3. O responsável abre o extrato da conta que recebeu o Pix.
4. Confere se o valor foi realmente creditado. Não confirme apenas por imagem de comprovante.
5. Na aba `Pedidos_Seguro`, localiza o pedido e altera somente a célula da coluna `STATUS` de `Aguardando` para `Pago`.
6. Em até um minuto, a página do aluno muda para **Pagamento confirmado** e libera a solicitação do PDF.
7. O Apps Script confere novamente o status, gera o PDF no servidor e grava o `CODIGO_VALIDACAO_TICKET` na mesma linha.
8. Na entrada, o responsável localiza o `PEDIDO_ID`, confirma que o status está `Pago` e compara o código do PDF com `CODIGO_VALIDACAO_TICKET`.
9. Somente depois dessa conferência, muda o status de `Pago` para `Utilizado`.

Não aceite apenas a aparência do PDF. Pedido, status e código de validação precisam coincidir com a planilha; uma cópia já usada aparecerá como `Utilizado`.

As únicas transições aceitas são:

```text
Aguardando → Pago → Utilizado
```

Tentativas de pular ou voltar etapas são desfeitas e registradas na aba `Auditoria`.

## Outras personalizações

### Turmas permitidas

As turmas precisam existir nos dois lugares abaixo:

1. `allowedClasses` em `apps-script/Code.gs`, que é a lista segura aceita pelo servidor;
2. as opções do campo `<select id="turma">` em `index.html`, que são exibidas ao aluno.

No backend, escreva os nomes sem acentos, seguindo o formato das turmas que já existem. Depois atualize a implantação.

### Quantidade máxima de pipocas

Altere `maxPopcorn` em `apps-script/Code.gs` e `MAX_PIPOCA` em `script.js` para o mesmo número.

### Quantidade máxima de ingressos

O comprador pode escolher de 1 a 10 ingressos por pedido. Para mudar esse limite, altere `maxTickets` em `apps-script/Code.gs` e `MAX_INGRESSOS` em `script.js` para o mesmo número. A coluna `INGRESSOS` da planilha já guarda a quantidade; não é necessário criar uma coluna nova.

### WhatsApp, data e textos do evento

- Procure por `wa.me` em `index.html` para trocar o número do WhatsApp em todos os links, inclusive no aviso de reembolso. Use o formato `55` + DDD + número, sem espaços, traços ou parênteses.
- Procure por `29 de Setembro` para trocar a data mostrada na página.
- Nome do evento, descrição, filmes e demais textos visíveis também ficam em `index.html`.

## 10. Teste completo antes da venda

1. Temporariamente, mude o ingresso para `1` centavo no backend.
2. Atualize a implantação.
3. Abra o site em uma janela anônima.
4. Tente um Gmail pessoal e confirme que ele é recusado.
5. Use um e-mail institucional e confira o recebimento do código.
6. Crie um pedido com mais de um ingresso e confirme que a quantidade aparece na coluna `INGRESSOS`, com status `Aguardando`.
7. Escaneie o QR e confira chave, recebedor e o valor multiplicado corretamente.
8. Faça o Pix de teste.
9. Confira o extrato e marque `Pago`.
10. Confirme que a página mostra **Pagamento confirmado** em até um minuto e baixa o ticket com a quantidade correta.
11. Confira se o código do ticket é igual ao valor de `CODIGO_VALIDACAO_TICKET` na planilha.
12. Depois de baixar o ticket, clique em **Fazer outro pedido** e confirme que o e-mail continua verificado, mas os campos da compra são limpos.
13. Marque `Utilizado` e confirme que uma nova emissão é recusada.
14. Teste o link de reembolso e confirme que ele abre o WhatsApp correto.
15. Volte os preços oficiais, atualize a implantação e repita uma conferência sem necessariamente pagar.

## Solução de problemas

### O código não chegou

- confira Spam e Lixeira;
- confirme `INSTITUTIONAL_DOMAIN`;
- veja **Execuções** no Apps Script;
- confirme que a rede educacional aceita e-mails enviados pela conta Google responsável;
- verifique a cota diária de envio de e-mails da conta do Apps Script.
- confira se algum dos limites `MAX_VERIFICATION_*` foi alcançado.

### A página diz que o servidor demorou

- confira se a URL `/exec` foi colada no `script.js`;
- confirme que a implantação permite acesso a **Qualquer pessoa**;
- confira `ALLOWED_ORIGINS`;
- confirme que uma nova versão foi implantada depois da última alteração.

### O status volta para `Aguardando`

- inclua o e-mail do responsável em `ADMIN_EMAILS`;
- altere uma única célula por vez;
- use somente `Aguardando → Pago → Utilizado`;
- veja a causa registrada na aba `Auditoria`.

### A mensagem não muda para pagamento confirmado

- mantenha a página aberta ou recarregue a mesma aba;
- confira se o status foi aceito e se `STATUS_CONFIRMADO` também está `Pago`;
- confira as execuções do Apps Script e a URL configurada no site.

## Cuidados importantes

- A planilha deve continuar privada.
- Somente responsáveis devem ser editores.
- O site nunca deve receber senhas de contas educacionais.
- Códigos, tokens e propriedades do script não devem ser enviados a outras pessoas.
- O extrato bancário é a fonte da confirmação; comprovantes enviados por alunos podem ser falsificados.
- Esta implementação usa Pix estático com confirmação humana. Uma confirmação bancária automática exigiria uma API Pix e webhook do banco ou de um intermediador.

## Capacidade diária aproximada

Quando o Apps Script pertence a uma conta Google pessoal, o envio de e-mails costuma ser o primeiro limite: a cota oficial é de até 100 destinatários por dia. A configuração padrão deste projeto para em 80 códigos por dia e preserva uma reserva de 10. Como reenvios também contam, planeje aproximadamente 60 a 80 compradores únicos por dia.

Para mais pessoas, migre a implantação para uma conta Google Workspace autorizada. Contas Workspace têm cotas maiores, mas os valores podem mudar; confira sempre a página oficial de cotas do Apps Script antes do evento. A consulta de pagamento ocorre uma vez por minuto e pausa quando a aba fica oculta, reduzindo bastante a carga.
