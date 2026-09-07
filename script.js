/** JavaScript da interface do Cine Infor. */
    /* =========================
       MENU MOBILE
    ========================= */

    const menuToggle =
      document.getElementById('menu-toggle');

    const navLinks =
      document.getElementById('nav-links');


    menuToggle.addEventListener('click', () => {

      const isOpen =
        navLinks.classList.toggle('open');

      menuToggle.setAttribute(
        'aria-expanded',
        String(isOpen)
      );

    });


    navLinks.querySelectorAll('a').forEach(link => {

      link.addEventListener('click', () => {

        navLinks.classList.remove('open');

        menuToggle.setAttribute(
          'aria-expanded',
          'false'
        );

      });

    });


    /* Valores iniciais para a tela. O backend sempre envia os preços oficiais. */
    let PRECOS = {
      ingresso: 2,
      pipoca: 1.50,
      refrigerante: 1
    };


    /* Limites visuais. O Apps Script repete e aplica estes limites no servidor. */

    const MAX_INGRESSOS = 10;
    const MAX_PIPOCA = 4;


    /* =========================
       INGRESSOS
    ========================= */

    const ingressoQtdValor =
      document.getElementById('ingressoQtdValor');

    const ingressoQtdMenos =
      document.getElementById('ingressoQtdMenos');

    const ingressoQtdMais =
      document.getElementById('ingressoQtdMais');

    let qtdIngressos = 1;

    function atualizarQuantidadeIngressos() {
      ingressoQtdValor.textContent = qtdIngressos;
      ingressoQtdMenos.disabled = qtdIngressos <= 1;
      ingressoQtdMais.disabled = qtdIngressos >= MAX_INGRESSOS;
    }

    ingressoQtdMenos.addEventListener('click', function () {
      if (qtdIngressos > 1) qtdIngressos -= 1;
      atualizarQuantidadeIngressos();
    });

    ingressoQtdMais.addEventListener('click', function () {
      if (qtdIngressos < MAX_INGRESSOS) qtdIngressos += 1;
      atualizarQuantidadeIngressos();
    });

    atualizarQuantidadeIngressos();


    /* =========================
       PIPOCA
    ========================= */

    const pipocaSim =
      document.getElementById('pipocaSim');

    const pipocaNao =
      document.getElementById('pipocaNao');

    const blocoTipoPipoca =
      document.getElementById('blocoTipoPipoca');

    const listaPipocas =
      document.getElementById('listaPipocas');

    const pipocaQtdValor =
      document.getElementById('pipocaQtdValor');

    const pipocaQtdMenos =
      document.getElementById('pipocaQtdMenos');

    const pipocaQtdMais =
      document.getElementById('pipocaQtdMais');


    let qtdPipoca = 1;


    /*
      Desenha, para cada pipoca do
      pedido, a escolha de tipo:
      Salgada ou Doce.

      Ex: 2 pipocas → o cliente
      escolhe o tipo de cada uma
      (uma doce e outra salgada,
      se quiser).
    */

    function renderizarListaPipocas() {

      listaPipocas.innerHTML = '';

      for (let i = 1; i <= qtdPipoca; i++) {

        const bloco =
          document.createElement('div');

        bloco.className = 'pipoca-unidade';

        bloco.innerHTML = `
          <span>Pipoca ${i}</span>
          <div class="opcoes">
            <label>
              <input type="radio" name="tipoPipoca_${i}" value="Salgada" required>
              <span>Salgada</span>
            </label>
            <label>
              <input type="radio" name="tipoPipoca_${i}" value="Doce">
              <span>Doce</span>
            </label>
          </div>
        `;

        listaPipocas.appendChild(bloco);

      }

      pipocaQtdValor.textContent = qtdPipoca;

      pipocaQtdMenos.disabled = qtdPipoca <= 1;

      pipocaQtdMais.disabled = qtdPipoca >= MAX_PIPOCA;

    }


    pipocaQtdMenos.addEventListener('click', function () {

      if (qtdPipoca > 1) {

        qtdPipoca--;

        renderizarListaPipocas();

      }

    });


    pipocaQtdMais.addEventListener('click', function () {

      if (qtdPipoca < MAX_PIPOCA) {

        qtdPipoca++;

        renderizarListaPipocas();

      }

    });


    /*
      CLICOU EM SIM

      Mostra a div de quantidade
      e tipo de pipoca.
    */

    pipocaSim.addEventListener('change', function () {

      blocoTipoPipoca.style.display = 'flex';

      qtdPipoca = 1;

      renderizarListaPipocas();

    });


    /*
      CLICOU EM NÃO

      Esconde a div e limpa
      a escolha da pipoca.
    */

    pipocaNao.addEventListener('change', function () {

      blocoTipoPipoca.style.display = 'none';

      listaPipocas.innerHTML = '';

      qtdPipoca = 1;

    });


    /* =========================
       URL DO GOOGLE APPS SCRIPT
    ========================= */

    const URL_APPS_SCRIPT =
      'https://script.google.com/macros/s/AKfycbzaXnEdQ1L1K-GUvyyG4BMCucZbrmPfv9qsUeUfDkGE034LsWT8LbK7ZYktQIh6QBGlSw/exec';


    /* =========================
       COMUNICAÇÃO COM O BACKEND

       O formulário oculto recebe uma resposta real do Apps Script por
       postMessage. Assim, erros não são confundidos com sucesso.
    ========================= */

    const requisicoesPendentes = new Map();

    function criarRequestId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function origemEhDoAppsScript(origem) {
      try {
        const host = new URL(origem).hostname;
        return host === 'script.google.com' || host.endsWith('.googleusercontent.com');
      } catch (error) {
        return false;
      }
    }

    window.addEventListener('message', function (event) {
      const resposta = event.data;
      if (!origemEhDoAppsScript(event.origin) ||
          !resposta ||
          resposta.source !== 'cine-infor-backend' ||
          !requisicoesPendentes.has(resposta.requestId)) {
        return;
      }

      const pendente = requisicoesPendentes.get(resposta.requestId);
      requisicoesPendentes.delete(resposta.requestId);
      clearTimeout(pendente.timer);
      pendente.iframe.remove();

      if (resposta.ok) {
        pendente.resolve(resposta);
      } else {
        const erro = new Error(resposta.error || 'Não foi possível concluir a operação.');
        erro.code = resposta.code || 'BACKEND_ERROR';
        pendente.reject(erro);
      }
    });

    function mensagemErroParaUsuario(error) {
      const code = error && error.code ? error.code : '';
      if (code === 'EMAIL_LIMIT_REACHED') {
        return 'O limite de atendimentos de hoje foi atingido. Por favor, retorne amanhã ou fale com um responsável.';
      }
      if (code === 'SERVICE_UNAVAILABLE' ||
          code === 'INTERNAL_ERROR' ||
          code === 'REQUEST_TIMEOUT') {
        return 'Serviço temporariamente indisponível. Tente novamente mais tarde. Se o problema continuar, retorne amanhã ou fale com um responsável.';
      }
      return error && error.message
        ? error.message
        : 'Não foi possível concluir a operação. Tente novamente.';
    }

    function chamarBackend(action, payload = {}, sessionToken = '') {
      return new Promise((resolve, reject) => {
        if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(URL_APPS_SCRIPT)) {
          reject(new Error('O endereço do Apps Script ainda não foi configurado no script.js.'));
          return;
        }

        const requestId = criarRequestId();
        const frameName = `cine_infor_${requestId.replace(/-/g, '')}`;
        const iframe = document.createElement('iframe');
        iframe.name = frameName;
        iframe.hidden = true;
        iframe.title = 'Comunicação com o Cine Infor';
        document.body.appendChild(iframe);

        const formBridge = document.createElement('form');
        formBridge.method = 'POST';
        formBridge.action = URL_APPS_SCRIPT;
        formBridge.target = frameName;
        formBridge.hidden = true;

        const campos = {
          action,
          requestId,
          sessionToken,
          payload: JSON.stringify(payload)
        };
        Object.entries(campos).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          formBridge.appendChild(input);
        });

        const timeoutMs = action === 'issueTicket' ? 60000 : 30000;
        const timer = setTimeout(() => {
          requisicoesPendentes.delete(requestId);
          iframe.remove();
          const erro = new Error('O servidor demorou para responder.');
          erro.code = 'REQUEST_TIMEOUT';
          reject(erro);
        }, timeoutMs);

        requisicoesPendentes.set(requestId, { resolve, reject, timer, iframe });
        document.body.appendChild(formBridge);
        formBridge.submit();
        formBridge.remove();
      });
    }

    function aplicarPrecos(precosEmCentavos) {
      if (!precosEmCentavos) return;
      PRECOS = {
        ingresso: Number(precosEmCentavos.ticket) / 100,
        pipoca: Number(precosEmCentavos.popcorn) / 100,
        refrigerante: Number(precosEmCentavos.soda) / 100
      };
      document.getElementById('precoIngresso').textContent = formatarReais(PRECOS.ingresso);
      document.getElementById('precoPipoca').textContent = formatarReais(PRECOS.pipoca);
      document.getElementById('precoRefrigerante').textContent = formatarReais(PRECOS.refrigerante);
      document.getElementById('precoIngressoTexto').textContent =
        `(${formatarReais(PRECOS.ingresso)} cada)`;
      document.getElementById('precoPipocaTexto').textContent =
        `(${formatarReais(PRECOS.pipoca)} cada)`;
    }

    chamarBackend('getPublicConfig').then(resposta => {
      aplicarPrecos(resposta.pricesInCents);
      if (resposta.serviceStatus && !resposta.serviceStatus.verificationAvailable) {
        const erro = new Error('Atendimento temporariamente indisponível.');
        erro.code = resposta.serviceStatus.retry === 'tomorrow'
          ? 'EMAIL_LIMIT_REACHED'
          : 'SERVICE_UNAVAILABLE';
        const statusInicial = document.getElementById('status');
        statusInicial.style.color = '#dc3545';
        statusInicial.textContent = mensagemErroParaUsuario(erro);
        document.getElementById('btnEnviarCodigo').disabled = true;
      }
    }).catch(error => {
      const statusInicial = document.getElementById('status');
      statusInicial.style.color = '#dc3545';
      statusInicial.textContent = mensagemErroParaUsuario(error);
    });


    /* =========================
       QR CODE + TICKET (PDF)
    ========================= */

    const qrcodeEl =
      document.getElementById('qrcode');

    const resultadoPedido =
      document.getElementById('resultadoPedido');

    const resumoLista =
      document.getElementById('resumoLista');

    const resumoTotal =
      document.getElementById('resumoTotal');

    const btnCopiarPix =
      document.getElementById('btnCopiarPix');

    const btnGerarTicket =
      document.getElementById('btnGerarTicket');

    const btnNovoPedido =
      document.getElementById('btnNovoPedido');

    const pagamentoStatus =
      document.getElementById('pagamentoStatus');

    const pagamentoStatusTitulo =
      document.getElementById('pagamentoStatusTitulo');

    const pagamentoStatusTexto =
      document.getElementById('pagamentoStatusTexto');


    let ultimoPixPayload = '';

    let ultimoPedido = null;

    let timerPagamento = null;

    let ticketEmitido = false;

    let falhasConsultaPagamento = 0;


    function formatarReais(valor) {

      return 'R$ ' +
        valor.toFixed(2).replace('.', ',');

    }


    function mostrarResultadoPedido(pedido) {

      ultimoPedido = pedido;

      if (pedido.precosEmCentavos) {
        aplicarPrecos(pedido.precosEmCentavos);
      }


      /* Monta o resumo em texto */

      resumoLista.innerHTML = '';

      ticketEmitido = false;
      falhasConsultaPagamento = 0;
      btnNovoPedido.hidden = true;
      btnNovoPedido.disabled = true;
      btnNovoPedido.textContent = 'Fazer outro pedido';

      const quantidadeIngressos = Math.max(1, Number(pedido.quantidadeIngressos) || 1);
      const itens = [
        {
          nome: quantidadeIngressos === 1
            ? '1 ingresso'
            : `${quantidadeIngressos} ingressos`,
          valor: PRECOS.ingresso * quantidadeIngressos
        }
      ];

      if (pedido.tiposPipoca.length > 0) {

        itens.push({
          nome: `Pipoca × ${pedido.tiposPipoca.length} (${pedido.tiposPipoca.join(', ')})`,
          valor: PRECOS.pipoca * pedido.tiposPipoca.length
        });

      }

      if (pedido.querRefri) {

        itens.push({ nome: 'Refrigerante', valor: PRECOS.refrigerante });

      }

      itens.forEach(item => {

        const li =
          document.createElement('li');

        const nomeItem = document.createElement('span');
        const valorItem = document.createElement('span');
        nomeItem.textContent = item.nome;
        valorItem.textContent = formatarReais(item.valor);
        li.append(nomeItem, valorItem);

        resumoLista.appendChild(li);

      });

      resumoTotal.textContent =
        formatarReais(pedido.total);


      /* Gera o QR Code do Pix */

      const payload = pedido.pixPayload;

      ultimoPixPayload = payload;

      qrcodeEl.innerHTML = '';

      new QRCode(qrcodeEl, {
        text: payload,
        width: 168,
        height: 168,
        colorDark: '#180705',
        colorLight: '#FFFCF7',
        correctLevel: QRCode.CorrectLevel.M
      });


      resultadoPedido.style.display = 'block';

      resultadoPedido.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });

    }


    function atualizarPagamento(status) {

      const confirmado = status === 'Pago' || status === 'Utilizado';
      const podeEmitirTicket = status === 'Pago';

      pagamentoStatus.classList.toggle('confirmado', confirmado);
      pagamentoStatus.classList.toggle('aguardando', !confirmado);

      if (confirmado) {
        pagamentoStatusTitulo.textContent = 'Pagamento confirmado';
        pagamentoStatusTexto.textContent =
          status === 'Utilizado'
            ? 'Pagamento confirmado e ticket já utilizado.'
            : 'O responsável confirmou o recebimento do Pix.';
        btnGerarTicket.disabled = !podeEmitirTicket;
        btnGerarTicket.textContent = podeEmitirTicket
          ? 'Baixar ticket (PDF)'
          : 'Ticket já utilizado';
        btnNovoPedido.hidden = false;
        btnNovoPedido.disabled = status === 'Pago' && !ticketEmitido;
        btnNovoPedido.textContent = btnNovoPedido.disabled
          ? 'Baixe o ticket antes de fazer outro pedido'
          : 'Fazer outro pedido';
      } else {
        pagamentoStatusTitulo.textContent = 'Aguardando confirmação';
        pagamentoStatusTexto.textContent =
          'Após fazer o Pix, deixe esta aba aberta. Você pode voltar mais tarde: o status será atualizado automaticamente quando o responsável confirmar.';
        btnGerarTicket.disabled = true;
        btnGerarTicket.textContent = 'Ticket disponível após a confirmação';
        btnNovoPedido.hidden = true;
      }

      return confirmado;

    }


    async function consultarPagamento() {

      if (!ultimoPedido || !ultimoPedido.statusToken) return;

      try {
        const resposta = await chamarBackend('getOrderStatus', {
          orderId: ultimoPedido.codigo,
          statusToken: ultimoPedido.statusToken
        });

        ultimoPedido.status = resposta.order.status;
        falhasConsultaPagamento = 0;
        sessionStorage.setItem('cineInforPedidoAtual', JSON.stringify(ultimoPedido));
        if (atualizarPagamento(resposta.order.status)) {
          clearInterval(timerPagamento);
          timerPagamento = null;
        }
      } catch (error) {
        falhasConsultaPagamento += 1;
        console.warn('Não foi possível atualizar o pagamento:', error.message);
        if (falhasConsultaPagamento >= 2) {
          pagamentoStatusTitulo.textContent = 'Não foi possível consultar agora';
          pagamentoStatusTexto.textContent = mensagemErroParaUsuario(error);
        }
      }

    }


    function acompanharPagamento() {

      clearInterval(timerPagamento);
      atualizarPagamento('Aguardando');
      if (document.hidden) {
        timerPagamento = null;
        return;
      }
      timerPagamento = setInterval(consultarPagamento, 60000);
      setTimeout(consultarPagamento, 1500);

    }


    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(timerPagamento);
        timerPagamento = null;
        return;
      }
      if (ultimoPedido && ultimoPedido.status === 'Aguardando') {
        acompanharPagamento();
      }
    });


    btnCopiarPix.addEventListener('click', function () {

      if (!ultimoPixPayload) return;

      navigator.clipboard
        .writeText(ultimoPixPayload)
        .then(() => {

          btnCopiarPix.textContent =
            'Código copiado!';

          setTimeout(() => {

            btnCopiarPix.textContent =
              'Copiar código Pix';

          }, 1800);

        })
        .catch(() => {

          btnCopiarPix.textContent =
            'Não foi possível copiar';

        });

    });


    function baixarArquivoBase64(base64, mimeType, fileName) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }


    btnGerarTicket.addEventListener('click', async function () {

      if (!ultimoPedido || !ultimoPedido.statusToken) return;

      btnGerarTicket.disabled = true;
      btnGerarTicket.textContent = 'Baixando PDF...';

      try {
        const resposta = await chamarBackend('issueTicket', {
          orderId: ultimoPedido.codigo,
          statusToken: ultimoPedido.statusToken
        });
        const ticket = resposta.ticket;
        if (!ticket || ticket.mimeType !== 'application/pdf' ||
            typeof ticket.base64 !== 'string' || !ticket.base64) {
          throw new Error('O servidor não retornou um ticket válido.');
        }

        baixarArquivoBase64(
          ticket.base64,
          ticket.mimeType,
          ticket.fileName || `ticket-cineinfor-${ultimoPedido.codigo}.pdf`
        );
        statusMsg.style.color = '#28a745';
        statusMsg.textContent =
          `PDF baixado. Código de validação: ${ticket.validationCode}.`;
        ticketEmitido = true;
        btnNovoPedido.hidden = false;
        btnNovoPedido.disabled = false;
        btnNovoPedido.textContent = 'Fazer outro pedido';
      } catch (error) {
        statusMsg.style.color = '#dc3545';
        statusMsg.textContent = mensagemErroParaUsuario(error);
        await consultarPagamento();
      } finally {
        const podeBaixar = ultimoPedido && ultimoPedido.status === 'Pago';
        btnGerarTicket.disabled = !podeBaixar;
        btnGerarTicket.textContent = podeBaixar
          ? 'Baixar ticket (PDF)'
          : 'Ticket indisponível';
      }

    });


    /* =========================
       FORMULÁRIO
    ========================= */

    const form =
      document.getElementById('formCineInfor');

    const btnEnviar =
      document.getElementById('btnEnviar');

    const statusMsg =
      document.getElementById('status');

    const dadosPedido =
      document.getElementById('dadosPedido');

    const emailInstitucional =
      document.getElementById('emailInstitucional');

    const btnEnviarCodigo =
      document.getElementById('btnEnviarCodigo');

    const blocoCodigo =
      document.getElementById('blocoCodigo');

    const codigoVerificacao =
      document.getElementById('codigoVerificacao');

    const btnConfirmarCodigo =
      document.getElementById('btnConfirmarCodigo');

    const emailStatus =
      document.getElementById('emailStatus');

    let sessaoComprador = '';

    let pedidoRequestId = '';

    document.getElementById('newsletterForm').addEventListener('submit', function (event) {
      event.preventDefault();
    });


    function mostrarEmailStatus(mensagem, tipo = '') {
      emailStatus.textContent = mensagem;
      emailStatus.className = `email-status ${tipo}`.trim();
    }


    function liberarFormulario(email, sessionToken, expiresInSeconds) {
      sessaoComprador = sessionToken;
      emailInstitucional.value = email;
      emailInstitucional.disabled = true;
      btnEnviarCodigo.hidden = true;
      blocoCodigo.hidden = true;
      dadosPedido.disabled = false;
      btnEnviar.disabled = false;
      mostrarEmailStatus(`E-mail confirmado: ${email}`, 'sucesso');
      sessionStorage.setItem('cineInforSessao', JSON.stringify({
        email,
        sessionToken,
        expiresAt: Date.now() + (Number(expiresInSeconds) * 1000)
      }));
    }


    function expirarSessaoComprador() {
      sessaoComprador = '';
      sessionStorage.removeItem('cineInforSessao');
      emailInstitucional.disabled = false;
      btnEnviarCodigo.hidden = false;
      dadosPedido.disabled = true;
      btnEnviar.disabled = true;
      mostrarEmailStatus('Confirme novamente o seu e-mail institucional.', 'erro');
    }


    btnEnviarCodigo.addEventListener('click', async function () {
      if (!emailInstitucional.reportValidity()) return;

      btnEnviarCodigo.disabled = true;
      mostrarEmailStatus('Enviando código...');
      try {
        const resposta = await chamarBackend('requestVerification', {
          email: emailInstitucional.value.trim()
        });
        blocoCodigo.hidden = false;
        codigoVerificacao.focus();
        mostrarEmailStatus(resposta.message, 'sucesso');
      } catch (error) {
        mostrarEmailStatus(mensagemErroParaUsuario(error), 'erro');
      } finally {
        btnEnviarCodigo.disabled = false;
      }
    });


    btnConfirmarCodigo.addEventListener('click', async function () {
      if (!codigoVerificacao.reportValidity()) return;

      btnConfirmarCodigo.disabled = true;
      mostrarEmailStatus('Confirmando código...');
      try {
        const resposta = await chamarBackend('verifyEmail', {
          email: emailInstitucional.value.trim(),
          code: codigoVerificacao.value.trim()
        });
        liberarFormulario(
          resposta.email,
          resposta.sessionToken,
          resposta.expiresInSeconds
        );
      } catch (error) {
        mostrarEmailStatus(mensagemErroParaUsuario(error), 'erro');
      } finally {
        btnConfirmarCodigo.disabled = false;
      }
    });


    codigoVerificacao.addEventListener('input', function () {
      codigoVerificacao.value = codigoVerificacao.value.replace(/\D/g, '').slice(0, 6);
    });


    codigoVerificacao.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        btnConfirmarCodigo.click();
      }
    });


    form.addEventListener('submit', async function (event) {

      event.preventDefault();
      if (!sessaoComprador) {
        expirarSessaoComprador();
        return;
      }

      btnEnviar.disabled = true;
      statusMsg.style.color = '#7c5b45';
      statusMsg.textContent = 'Criando pedido e gerando Pix...';
      let pedidoCriado = false;

      const tiposPipoca = [];
      if (pipocaSim.checked) {
        for (let i = 1; i <= qtdPipoca; i++) {
          const selecionado = document.querySelector(
            `input[name="tipoPipoca_${i}"]:checked`
          );
          if (selecionado) tiposPipoca.push(selecionado.value);
        }
      }

      const querRefri = document.querySelector(
        'input[name="refri"][value="sim"]'
      ).checked;

      if (!pedidoRequestId) pedidoRequestId = criarRequestId();

      const dados = {
        nome: document.getElementById('nome').value,
        turma: document.getElementById('turma').value,
        quantidadeIngressos: qtdIngressos,
        querPipoca: pipocaSim.checked,
        quantidadePipoca: tiposPipoca.length,
        tiposPipoca,
        querRefri,
        requestId: pedidoRequestId
      };

      try {
        const resposta = await chamarBackend('createOrder', dados, sessaoComprador);
        const ordem = resposta.order;
        aplicarPrecos(ordem.pricesInCents);

        const pedido = {
          nome: dados.nome,
          turma: dados.turma,
          quantidadeIngressos: Number(ordem.ticketQuantity) || dados.quantidadeIngressos,
          tiposPipoca,
          querRefri,
          total: Number(ordem.totalCents) / 100,
          codigo: ordem.id,
          dataFormatada: new Date(ordem.createdAt).toLocaleString('pt-BR'),
          pixPayload: ordem.pixPayload,
          statusToken: ordem.statusToken,
          precosEmCentavos: ordem.pricesInCents,
          status: ordem.status
        };

        mostrarResultadoPedido(pedido);
        if (!atualizarPagamento(ordem.status)) acompanharPagamento();
        sessionStorage.setItem('cineInforPedidoAtual', JSON.stringify(pedido));
        statusMsg.style.color = '#28a745';
        statusMsg.textContent =
          'Pix gerado. Faça o pagamento e volte mais tarde nesta mesma aba; confirmaremos o status automaticamente.';
        dadosPedido.disabled = true;
        btnEnviar.textContent = 'Pedido gerado';
        pedidoCriado = true;
      } catch (error) {
        statusMsg.style.color = '#dc3545';
        statusMsg.textContent = mensagemErroParaUsuario(error);
        if (error.code === 'AUTH_REQUIRED' || error.code === 'SESSION_EXPIRED') {
          expirarSessaoComprador();
        }
        console.error(error);
      } finally {
        if (!pedidoCriado && sessaoComprador) btnEnviar.disabled = false;
      }

    });


    btnNovoPedido.addEventListener('click', function () {
      clearInterval(timerPagamento);
      timerPagamento = null;
      sessionStorage.removeItem('cineInforPedidoAtual');
      ultimoPedido = null;
      ultimoPixPayload = '';
      pedidoRequestId = '';
      ticketEmitido = false;
      resultadoPedido.style.display = 'none';
      btnNovoPedido.hidden = true;

      document.getElementById('nome').value = '';
      document.getElementById('turma').value = '';
      form.querySelectorAll('input[name="pipoca"], input[name="refri"]')
        .forEach(input => { input.checked = false; });

      qtdIngressos = 1;
      atualizarQuantidadeIngressos();
      qtdPipoca = 1;
      blocoTipoPipoca.style.display = 'none';
      listaPipocas.innerHTML = '';

      if (!sessaoComprador) {
        expirarSessaoComprador();
      } else {
        dadosPedido.disabled = false;
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Gerar Pix';
        statusMsg.style.color = '#7c5b45';
        statusMsg.textContent = 'Novo pedido iniciado. Escolha os itens e gere um novo Pix.';
        document.getElementById('nome').focus();
      }

      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });


    try {
      const sessaoSalva = JSON.parse(sessionStorage.getItem('cineInforSessao') || 'null');
      if (sessaoSalva && sessaoSalva.expiresAt > Date.now()) {
        liberarFormulario(
          sessaoSalva.email,
          sessaoSalva.sessionToken,
          (sessaoSalva.expiresAt - Date.now()) / 1000
        );
      }

      const pedidoSalvo = JSON.parse(sessionStorage.getItem('cineInforPedidoAtual') || 'null');
      if (pedidoSalvo && pedidoSalvo.codigo && pedidoSalvo.statusToken) {
        mostrarResultadoPedido(pedidoSalvo);
        dadosPedido.disabled = true;
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Pedido gerado';
        if (!atualizarPagamento(pedidoSalvo.status || 'Aguardando')) {
          acompanharPagamento();
        }
      }
    } catch (error) {
      sessionStorage.removeItem('cineInforSessao');
      sessionStorage.removeItem('cineInforPedidoAtual');
    }
