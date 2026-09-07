# Segurança e revisão antes da publicação

## O que esta implementação protege

- Planilha privada, acessada pelo site somente por meio do Apps Script.
- Acesso do comprador limitado à criação de pedido.
- E-mail obtido da sessão Google; o backend não confia em um e-mail digitado no formulário.
- Domínio institucional comparado de forma exata.
- Campos desconhecidos, incluindo `status`, são rejeitados.
- Preços e total recalculados no servidor em centavos.
- IDs aleatórios gerados no servidor.
- Limite de pedidos por conta e janela de deduplicação.
- Bloqueio de concorrência durante gravações.
- Textos neutralizados antes de entrar no Sheets, evitando fórmulas injetadas.
- Fluxo de status restrito a `Aguardando -> Pago -> Utilizado`.
- Estado canônico protegido, usado para restaurar alterações ou colagens inválidas.
- Registro de data, hora e conta responsável por mudanças de status.
- Falhas internas não expõem rastros, IDs da planilha ou configurações ao cliente.
- Nenhuma função de administração está publicada na web.

## DevTools e console do Chrome

Nenhum site consegue impedir totalmente que o visitante abra o DevTools, leia arquivos enviados ao navegador ou crie uma requisição manual. Desabilitar clique direito, detectar `F12` ou ofuscar JavaScript dá apenas uma falsa sensação de segurança e prejudica acessibilidade.

A defesa aplicada aqui é do lado servidor: mesmo com a URL conhecida e o JavaScript completamente alterado, o solicitante não consegue definir preço, ID, status, pagamento ou utilização. A URL do Apps Script não é tratada como segredo.

## Pontos que continuam dependendo de configuração humana

- O Google Workspace da escola precisa permitir implantação restrita ao domínio.
- A implantação precisa estar configurada para o domínio, não para acesso anônimo.
- A planilha precisa continuar com acesso geral `Restrito`.
- `ADMIN_EMAILS` deve conter somente organizadores ativos.
- O projeto Apps Script deve ficar sob uma conta institucional controlada, com 2FA.
- O responsável precisa revisar permissões quando alguém sair da organização.
- Backups devem ser feitos antes do evento e antes de mudanças importantes.
- O extrato bancário é a fonte da confirmação do Pix, não o comprovante apresentado.

## Erros para procurar nos testes posteriores

1. Enviar `status: "Pago"`, `status: "Utilizado"` ou qualquer campo inesperado.
2. Alterar no console os preços, quantidades e o total enviado.
3. Enviar quantidade negativa, decimal, maior que quatro ou incompatível com os tipos.
4. Enviar `querPipoca: false` junto com tipos de pipoca.
5. Enviar strings como `"false"` no lugar de booleanos reais.
6. Usar uma turma inexistente ou modificar o texto de uma turma no navegador.
7. Usar nomes começando com `=`, `+`, `-` ou `@`, tags HTML, controles ou texto muito longo.
8. Mandar JSON inválido, array no lugar de objeto, corpo vazio ou corpo acima de 4 KB.
9. Repetir rapidamente o mesmo pedido e confirmar que não são criadas duplicatas acidentais.
10. Tentar mais pedidos por hora do que o limite configurado.
11. Tentar acessar usando Gmail pessoal ou conta de outro domínio.
12. Tentar um domínio enganoso, como `escola.edu.br.exemplo.com`.
13. Abrir a URL do Web App por `GET` e confirmar que nenhum pedido ou dado é exibido.
14. Procurar no código público por ID da planilha, lista de administradores ou segredos.
15. Tentar acessar a planilha com uma conta de aluno ou em janela anônima.
16. Tentar alterar `Aguardando` diretamente para `Utilizado`.
17. Tentar voltar `Pago` para `Aguardando` ou `Utilizado` para `Pago`.
18. Tentar mudar status com um editor não listado em `ADMIN_EMAILS`.
19. Colar status em várias linhas ao mesmo tempo e verificar o bloqueio.
20. Fazer duas tentativas de uso do mesmo ingresso quase simultaneamente.
21. Remover um administrador e confirmar que ele perde acesso ao Drive e às alterações.
22. Induzir um erro do servidor e verificar que a resposta não contém stack trace ou configuração.
23. Conferir se o total do backend é idêntico ao valor mostrado no QR Pix.
24. Confirmar que um erro do backend não aparece como “Pedido enviado com sucesso” no site.
25. Testar cotas e comportamento sob muitas requisições antes do dia do evento.
26. Verificar as bibliotecas externas de QR Code e PDF; preferir arquivos próprios ou usar integridade (`SRI`) e política de conteúdo (`CSP`).
27. Confirmar que o e-mail do autor aparece no gatilho de edição do Workspace; se o Google não o fornecer, a alteração deve falhar fechada.

Os itens 23 e 24 continuarão falhando enquanto o frontend antigo usar `no-cors` e gerar total/código localmente. Não publique pagamentos reais antes de concluir essa integração.
