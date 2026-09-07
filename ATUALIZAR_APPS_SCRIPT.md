# Atualizar o Google Apps Script

Use este roteiro quando alguém alterar o projeto no GitHub ou no computador.

## Primeiro: descubra o que mudou

- Mudou somente `index.html`, `style.css`, `script.js`, imagens ou `vendor/`: atualize o GitHub. Não precisa mexer no Apps Script.
- Mudou `apps-script/Code.gs`: atualize o Apps Script e crie uma nova versão da implantação.
- Mudou `apps-script/appsscript.json`: copie também o manifesto, se ele estiver visível no editor.
- Mudaram o frontend e `Code.gs`: atualize primeiro o Apps Script e depois o GitHub.

## Como atualizar `Code.gs`

1. No projeto recebido, abra `apps-script/Code.gs`.
2. Pressione `Ctrl + A` e `Ctrl + C` para copiar o arquivo inteiro.
3. Entre em [script.google.com](https://script.google.com) com a conta responsável.
4. Abra o projeto **Cine Infor Backend**.
5. Abra o arquivo `Code.gs` do editor online.
6. Pressione `Ctrl + A` e cole o novo conteúdo.
7. Salve.

Se a mudança adicionou colunas, propriedades padrão, proteções ou gatilhos:

1. escolha `configurarProjeto` no seletor de funções;
2. clique em **Executar**;
3. aceite as permissões, se forem solicitadas;
4. confirme que as abas `Pedidos_Seguro` e `Auditoria` continuam disponíveis.

Executar `configurarProjeto` novamente não deve apagar os pedidos. Mesmo assim, faça uma cópia da planilha antes de alterações grandes.

## Publicar a nova versão

Salvar o código não atualiza sozinho a versão usada pelo site.

1. Clique em **Implantar > Gerenciar implantações**.
2. Abra a implantação atual pelo ícone de lápis.
3. Em **Versão**, escolha **Nova versão**.
4. Clique em **Implantar**.
5. Mantenha a URL terminada em `/exec` que já está no `script.js`.

Evite criar outra implantação sem necessidade. Editar a implantação atual mantém a mesma URL.

## Conferência rápida

1. Abra o site em uma janela anônima.
2. Solicite um código em um e-mail institucional de teste.
3. Crie um pedido barato de teste.
4. Confirme quantidade, valor do Pix e nova linha na planilha.
5. Marque o pedido como `Pago`.
6. Aguarde até um minuto e baixe o PDF.
7. Confira o código de validação e marque `Utilizado`.

Nunca copie para o GitHub as Propriedades do script, o `AUTH_SECRET`, o ID real da planilha, dados de compradores ou arquivos de credenciais.

