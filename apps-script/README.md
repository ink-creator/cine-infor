# Backend seguro — Google Apps Script

Este diretório contém o backend do formulário. Ele foi desenhado para ser um projeto Apps Script **independente**, separado da planilha e do site.

## Estrutura de acesso

```text
Aluno com conta institucional
        -> Web App (somente criar pedido)
        -> Planilha privada

Organizador autorizado
        -> Planilha privada (somente STATUS editável)

Responsável técnico
        -> Projeto Apps Script e configurações
```

Não existe rota web de admin, busca, listagem, pagamento, utilização ou exclusão. `doGet()` não retorna dados e `doPost()` sempre cria um pedido com status `Aguardando`.

## Propriedades obrigatórias

Em **Configurações do projeto > Propriedades do script**, crie:

| Propriedade | Exemplo | Finalidade |
|---|---|---|
| `SPREADSHEET_ID` | trecho entre `/d/` e `/edit` na URL | Planilha privada usada pelo backend |
| `INSTITUTIONAL_DOMAIN` | `aluno.escola.edu.br` | Domínio aceito, sem `@` |
| `REQUIRE_INSTITUTIONAL_EMAIL` | `true` | Mantém o sistema fechado para outras contas |
| `ADMIN_EMAILS` | `ana@escola.edu.br,joao@escola.edu.br` | Quem pode mudar status |
| `MAX_ORDERS_PER_EMAIL_PER_HOUR` | `5` | Limite por conta institucional |

Não coloque esses valores no frontend.

## Instalação

1. Crie uma planilha vazia usando a conta institucional responsável.
2. Em Compartilhar, mantenha **Acesso geral: Restrito**.
3. Compartilhe a planilha apenas com os organizadores que constam em `ADMIN_EMAILS`.
4. Crie um projeto Apps Script independente em `script.google.com` com a conta técnica responsável.
5. Copie `Code.gs` e `appsscript.json` para o projeto.
6. Configure as propriedades acima.
7. Execute manualmente `configurarProjeto()` e aceite as permissões.
8. Confirme que foram criadas as abas `Pedidos_Seguro` e `Auditoria`.
9. Em **Implantar > Nova implantação > App da Web**, escolha:
   - executar como a conta responsável pela implantação;
   - acesso apenas às pessoas do domínio institucional.
10. Não publique o projeto como API executável e não compartilhe o projeto Apps Script com os organizadores comuns.

Se a escola não possuir Google Workspace com domínio institucional, a restrição por domínio não funcionará dessa forma. Não substitua isso por uma senha colocada no JavaScript. Nesse caso será necessário decidir outro mecanismo de autenticação antes da publicação.

## Operação

- Um pedido sempre nasce como `Aguardando`.
- Somente um e-mail listado em `ADMIN_EMAILS` pode realizar a sequência `Aguardando -> Pago -> Utilizado`.
- Mudanças inversas ou saltos são revertidos.
- Uma coluna canônica protegida permite restaurar também colagens e alterações em bloco.
- A alteração registra horário e responsável na aba de pedidos e na auditoria.
- `Pago` só deve ser selecionado depois da conferência no extrato bancário; imagem de comprovante não basta.
- Nunca dê permissão de edição da planilha para alunos/compradores.

## Integração pendente do frontend

O `index.html` existente ainda:

- calcula preço no navegador;
- gera o código do pedido no navegador;
- usa `mode: 'no-cors'`, que impede confirmar se o servidor aceitou ou recusou;
- mostra sucesso mesmo quando o backend responde com erro;
- usa um endpoint antigo.

O backend ignora o total falsificado e protege a planilha, mas o ticket exibido pelo site ainda não é confiável. A integração só estará completa quando o frontend usar `id`, `totalCents` e `status` retornados pelo servidor.

A opção mais robusta é hospedar o próprio formulário pelo Apps Script e chamar o servidor com `google.script.run`. Isso permite autenticação institucional e resposta confiável sem expor funções administrativas. Essa mudança exige autorização para alterar/migrar o HTML.

## Preços a confirmar

O backend usa os valores que hoje aparecem no JavaScript:

- ingresso: R$ 2,00;
- pipoca: R$ 1,50;
- refrigerante: R$ 1,00.

O HTML mostra no texto “R$ 3 cada” para pipoca, mas o JavaScript cobra R$ 1,50. Corrija essa divergência antes de vender. O preço definitivo deve continuar definido no servidor.
