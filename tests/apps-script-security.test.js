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
    total: '0.01',
    ...overrides
  };
}

test('recalcula o total no servidor e ignora total adulterado', () => {
  const order = context.validateOrderPayload_(validPayload());
  assert.equal(order.totalCents, 600);
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

test('rejeita total em formato estrutural inesperado mesmo sem confiar nele', () => {
  assert.throws(
    () => context.validateOrderPayload_(validPayload({ total: { status: 'Pago' } })),
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
