const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'apps-script', 'Code.gs'),
  'utf8'
);

const context = vm.createContext({
  console,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date,
  Math,
  JSON,
  RegExp,
  Error,
  PropertiesService: {},
  Session: { getScriptTimeZone: () => 'America/Fortaleza' },
  SpreadsheetApp: {},
  LockService: {},
  ScriptApp: {},
  ContentService: {},
  Utilities: {
    formatDate: date => date.toISOString()
  }
});
vm.runInContext(source, context, { filename: 'Code.gs' });

function validPayload(overrides = {}) {
  return {
    nome: 'Maria da Silva',
    turma: '2 ano Informática',
    quantidadeIngressos: 1,
    querPipoca: true,
    quantidadePipoca: 2,
    tipoPipoca: 'Salgada, Doce',
    querRefri: true,
    ...overrides
  };
}

test('calcula o total no servidor', () => {
  const order = context.validateOrderPayload_(validPayload());
  assert.equal(order.totalCents, 600);
});

test('multiplica os ingressos no total calculado pelo servidor', () => {
  const order = context.validateOrderPayload_(validPayload({ quantidadeIngressos: 3 }));
  assert.equal(order.ticketQuantity, 3);
  assert.equal(order.totalCents, 1000);
});

test('rejeita quantidades de ingressos invalidas', () => {
  for (const quantidadeIngressos of [0, -1, 1.5, 11, '2']) {
    assert.throws(
      () => context.validateOrderPayload_(validPayload({ quantidadeIngressos })),
      error => error.code === 'INVALID_TICKET_QUANTITY'
    );
  }
});

test('site antigo continua criando um ingresso durante a troca de versoes', () => {
  const payload = validPayload();
  delete payload.quantidadeIngressos;
  const order = context.validateOrderPayload_(payload);
  assert.equal(order.ticketQuantity, 1);
});

test('rejeita tentativa de enviar total pelo navegador', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ total: '0.01' })),
    error => error.code === 'UNEXPECTED_FIELD'
  );
});

test('rejeita tentativa de enviar status', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ status: 'Pago' })),
    error => error.code === 'UNEXPECTED_FIELD'
  );
});

test('aceita turma com acentos e a compara com allowlist', () => {
  const order = context.validateOrderPayload_(validPayload());
  assert.equal(order.className, '2 ano Informatica');
});

test('rejeita turma fora da allowlist', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ turma: 'Turma inventada' })),
    error => error.code === 'INVALID_CLASS'
  );
});

test('rejeita formula e HTML no campo nome', () => {
  for (const nome of ['=IMPORTXML("x")', '+1+1', '<img src=x>']) {
    assert.throws(
      () => context.validateOrderPayload_(validPayload({ nome })),
      error => error.code === 'INVALID_NAME'
    );
  }
});

test('rejeita booleano representado como string', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ querRefri: 'false' })),
    error => error.code === 'INVALID_FIELD'
  );
});

test('rejeita dois formatos conflitantes de tipos de pipoca', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ tiposPipoca: ['Salgada', 'Doce'] })),
    error => error.code === 'INVALID_POPCORN'
  );
});

test('rejeita quantidade acima do maximo', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({
      quantidadePipoca: 5,
      tipoPipoca: 'Doce, Doce, Doce, Doce, Doce'
    })),
    error => error.code === 'INVALID_POPCORN'
  );
});

test('rejeita pipoca quando querPipoca e falso', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ querPipoca: false })),
    error => error.code === 'INVALID_POPCORN'
  );
});

test('dominio institucional exige correspondencia exata', () => {
  assert.equal(context.isInstitutionalEmail_('aluno@escola.edu.br', 'escola.edu.br'), true);
  assert.equal(context.isInstitutionalEmail_('aluno@escola.edu.br.atacante.com', 'escola.edu.br'), false);
  assert.equal(context.isInstitutionalEmail_('aluno@gmail.com', 'escola.edu.br'), false);
  assert.equal(context.isInstitutionalEmail_('aluno\ninvasor@escola.edu.br', 'escola.edu.br'), false);
});

test('somente as transicoes de status planejadas sao aceitas', () => {
  assert.equal(context.isAllowedTransition_('Aguardando', 'Pago'), true);
  assert.equal(context.isAllowedTransition_('Pago', 'Utilizado'), true);
  assert.equal(context.isAllowedTransition_('Aguardando', 'Utilizado'), false);
  assert.equal(context.isAllowedTransition_('Utilizado', 'Pago'), false);
});

test('rejeita repeticao e saltos de status', () => {
  assert.equal(context.isAllowedTransition_('Pago', 'Pago'), false);
  assert.equal(context.isAllowedTransition_('Utilizado', 'Utilizado'), false);
  assert.equal(context.isAllowedTransition_('', 'Pago'), false);
});

test('neutraliza texto de planilha como segunda barreira', () => {
  assert.equal(context.spreadsheetSafeText_('=1+1'), "'=1+1");
  assert.equal(context.spreadsheetSafeText_('Maria'), 'Maria');
});

test('parse rejeita JSON grande ou raiz em array', () => {
  assert.throws(
    () => context.parseRequestBody_({ postData: { contents: 'x'.repeat(4097) } }),
    error => error.code === 'INVALID_BODY'
  );
  assert.throws(
    () => context.parseRequestBody_({ postData: { contents: '[]' } }),
    error => error.code === 'INVALID_BODY'
  );
});

test('ponte do frontend aceita somente request id e objeto validos', () => {
  const request = context.parseBridgeRequest_({
    parameter: {
      action: 'getPublicConfig',
      requestId: '12345678-1234-1234-1234-123456789abc',
      payload: '{}'
    }
  });
  assert.equal(request.action, 'getPublicConfig');
  assert.equal(request.requestId, '12345678-1234-1234-1234-123456789abc');

  assert.throws(
    () => context.parseBridgeRequest_({
      parameter: { action: 'x', requestId: 'curto', payload: '{}'}
    }),
    error => error.code === 'INVALID_REQUEST_ID'
  );
  assert.throws(
    () => context.parseBridgeRequest_({
      parameter: {
        action: 'x',
        requestId: '12345678-1234-1234-1234-123456789abc',
        payload: '[]'
      }
    }),
    error => error.code === 'INVALID_BODY'
  );
});

test('comparacao de segredo rejeita diferencas', () => {
  assert.equal(context.constantTimeEquals_('abcdef', 'abcdef'), true);
  assert.equal(context.constantTimeEquals_('abcdef', 'abcdeg'), false);
  assert.equal(context.constantTimeEquals_('abcdef', 'abc'), false);
});

test('payload Pix usa o total calculado e inclui CRC', () => {
  const payload = context.createPixPayload_(
    'CI-' + 'A'.repeat(32),
    600,
    { key: 'pix@example.com', receiverName: 'CINE INFOR', city: 'FORTALEZA' }
  );
  assert.match(payload, /54046\.00/);
  assert.match(payload, /BR\.GOV\.BCB\.PIX/);
  assert.match(payload, /6304[A-F0-9]{4}$/);
});

test('estrutura da planilha reserva hash privado para consulta de status', () => {
  const headers = vm.runInContext('Array.from(ORDER_HEADERS_)', context);
  const statusTokenColumn = vm.runInContext('COL_.statusTokenHash', context);
  const ticketValidationColumn = vm.runInContext('COL_.ticketValidationCode', context);
  assert.equal(headers[statusTokenColumn - 1], 'STATUS_TOKEN_HASH');
  assert.equal(headers[ticketValidationColumn - 1], 'CODIGO_VALIDACAO_TICKET');
  assert.equal(ticketValidationColumn, headers.length);
});

test('contador de e-mail reinicia por hora e por dia', () => {
  const sameHour = context.normalizeVerificationRateState_(
    JSON.stringify({ day: '2026-09-07', dayCount: 8, hour: '2026-09-07-10', hourCount: 3 }),
    '2026-09-07',
    '2026-09-07-10'
  );
  assert.equal(sameHour.dayCount, 8);
  assert.equal(sameHour.hourCount, 3);

  const nextHour = context.normalizeVerificationRateState_(
    JSON.stringify({ day: '2026-09-07', dayCount: 8, hour: '2026-09-07-10', hourCount: 3 }),
    '2026-09-07',
    '2026-09-07-11'
  );
  assert.equal(nextHour.dayCount, 8);
  assert.equal(nextHour.hourCount, 0);

  const nextDay = context.normalizeVerificationRateState_(
    JSON.stringify({ day: '2026-09-07', dayCount: 8, hour: '2026-09-07-10', hourCount: 3 }),
    '2026-09-08',
    '2026-09-08-09'
  );
  assert.equal(nextDay.dayCount, 0);
  assert.equal(nextDay.hourCount, 0);
});

test('emissao do PDF exige status Pago no servidor', () => {
  assert.match(source, /status !== CONFIG_\.status\.paid/);
  assert.match(source, /createHtmlOutput\(createTicketHtml_/);
  assert.match(source, /\.getAs\('application\/pdf'\)/);
});

test('ticket usa estado canonico e escapa texto antes do PDF', () => {
  const headers = vm.runInContext('Array.from(ORDER_HEADERS_)', context);
  const row = Array(headers.length).fill('');
  const columns = vm.runInContext('COL_', context);
  row[columns.id - 1] = 'CI-' + 'A'.repeat(32);
  row[columns.name - 1] = '<script>alert(1)</script>';
  row[columns.className - 1] = '2 ano Informatica';
  row[columns.ticketQuantity - 1] = 3;
  row[columns.totalFormatted - 1] = 'R$ 2,00';
  row[columns.status - 1] = 'Pago';
  row[columns.confirmedStatus - 1] = 'Aguardando';

  assert.equal(context.getConfirmedStatusFromRow_(row), 'Aguardando');
  const html = context.createTicketHtml_(row, 'AAAA-BBBB-CCCC-DDDD', new Date());
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /3 ingressos/);
});
