const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbxUGvBSrISFbcincsnqTAgj86RogqcpaDSyjKkbV_CHJfVhRvt49Y5LgQAXy1NYuOpR/exec';
const form = document.getElementById('formCineInfor')
const btnEnviar = document.getElementById('btnEnviar');
const statusMsg = document.getElementById('status');

//Pipoca
const pipocaSim = document.getElementById('pipocaSim');
const pipocaNao = document.getElementById('pipocaNao');
const blocoTipoPipoca = document.getElementById('blocoTipoPipoca');
const tipoSalgada = document.getElementById('tipoSalgada');


pipocaSim.addEventListener('change', function() {
  blocoTipoPipoca.style.display = 'flex';
  tipoSalgada.checked = true; 
});


pipocaNao.addEventListener('change', function() {
  blocoTipoPipoca.style.display = 'none';
});

form.addEventListener('submit', function(e) {
  e.preventDefault();

  btnEnviar.disabled = true;
  statusMsg.style.color = '#ffffff';
  statusMsg.innerText = 'Enviando...';

  const tipoPipocaSelecionada = document.querySelector('input[name="tipoPipoca"]:checked');
  const querRefri = document.querySelector('input[name="refri"][value="sim"]').checked;

  const dados = {
    nome: document.getElementById('nome').value,
    turma: document.getElementById('turma').value,
    querPipoca: pipocaSim.checked,
    tipoPipoca: pipocaSim.checked && tipoPipocaSelecionada ? tipoPipocaSelecionada.value : "N/A",
    querRefri: querRefri
  };

  fetch(URL_APPS_SCRIPT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  })
  .then(() => {
    statusMsg.style.color = '#28a745';
    statusMsg.innerText = 'Pedido confirmado!';
    form.reset();
    blocoTipoPipoca.style.display = 'none';
  })
  .catch(error => {
    statusMsg.style.color = '#dc3545';
    statusMsg.innerText = 'Erro ao enviar pedido.';
    console.error(error);
  })
  .finally(() => {
    btnEnviar.disabled = false;
  });
});