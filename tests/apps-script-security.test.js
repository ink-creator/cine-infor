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
  Session: {},
  SpreadsheetApp: {},
  LockService: {},
  ScriptApp: {},
  ContentService: {},
  Utilities: {}
});
vm.runInContext(source, context, { filename: 'Code.gs' });

function validPayload(overrides = {}) {
  return {
    nome: 'Maria da Silva',
    turma: '2 ano Informática',
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
  assert.equal(headers.at(-1), 'STATUS_TOKEN_HASH');
  assert.equal(statusTokenColumn, headers.length);
});
