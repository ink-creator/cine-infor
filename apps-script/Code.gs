/**
 * Backend seguro do Cine Infor para Google Apps Script (runtime V8).
 *
 * Este projeto deve ser criado como um Apps Script INDEPENDENTE. Nao vincule o
 * codigo a planilha: assim, editores da planilha nao ganham acesso ao backend.
 * A unica superficie HTTP de operacao e doPost(), com acoes limitadas para
 * confirmar e-mail, criar pedido e consultar um status mediante token.
 */

const CONFIG_ = Object.freeze({
  sheetName: 'Pedidos_Seguro',
  auditSheetName: 'Auditoria',
  maxPayloadBytes: 4096,
  maxNameLength: 100,
  maxPopcorn: 4,
  duplicateWindowMs: 30000,
  defaultOrdersPerHour: 5,
  verificationCodeTtlSeconds: 10 * 60,
  verificationCooldownSeconds: 60,
  buyerSessionTtlSeconds: 6 * 60 * 60,
  maxVerificationAttempts: 5,
  status: Object.freeze({
    waiting: 'Aguardando',
    paid: 'Pago',
    used: 'Utilizado'
  }),
  pricesInCents: Object.freeze({
    ticket: 200,
    popcorn: 150,
    soda: 100
  }),
  allowedClasses: Object.freeze([
    '1 ano Administracao',
    '1 ano Enfermagem',
    '1 ano Informatica',
    '1 ano Secretaria',
    '2 ano Agronegocio',
    '2 ano Enfermagem',
    '2 ano Financas',
    '2 ano Informatica',
    '3 ano Administracao',
    '3 ano Enfermagem',
    '3 ano Informatica',
    '3 ano Logistica'
  ]),
  allowedPopcornTypes: Object.freeze(['Salgada', 'Doce']),
  acceptedPayloadFields: Object.freeze([
    'nome',
    'turma',
    'querPipoca',
    'quantidadePipoca',
    'tipoPipoca',
    'tiposPipoca',
    'querRefri',
    'requestId'
  ])
});

const ORDER_HEADERS_ = Object.freeze([
  'PEDIDO_ID',
  'CRIADO_EM',
  'EMAIL_INSTITUCIONAL',
  'NOME',
  'TURMA',
  'INGRESSOS',
  'PIPOCAS',
  'TIPOS_PIPOCA',
  'REFRIGERANTES',
  'TOTAL_CENTAVOS',
  'TOTAL_FORMATADO',
  'STATUS',
  'PAGO_EM',
  'PAGO_POR',
  'UTILIZADO_EM',
  'UTILIZADO_POR',
  'CHAVE_REQUISICAO',
  'ULTIMA_ALTERACAO',
  'STATUS_CONFIRMADO',
  'STATUS_TOKEN_HASH'
]);

const AUDIT_HEADERS_ = Object.freeze([
  'DATA_HORA',
  'PEDIDO_ID',
  'STATUS_ANTERIOR',
  'STATUS_NOVO',
  'RESPONSAVEL',
  'RESULTADO'
]);

const COL_ = Object.freeze({
  id: 1,
  createdAt: 2,
  email: 3,
  name: 4,
  className: 5,
  ticketQuantity: 6,
  popcornQuantity: 7,
  popcornTypes: 8,
  sodaQuantity: 9,
  totalCents: 10,
  totalFormatted: 11,
  status: 12,
  paidAt: 13,
  paidBy: 14,
  usedAt: 15,
  usedBy: 16,
  requestKey: 17,
  updatedAt: 18,
  confirmedStatus: 19,
  statusTokenHash: 20
});

function PublicError_(code, message) {
  this.name = 'PublicError';
  this.code = code;
  this.message = message;
}
PublicError_.prototype = Object.create(Error.prototype);

/**
 * Leitura publica deliberadamente desabilitada. Nao adicione busca de pedidos,
 * listagem, administracao ou mudanca de status neste endpoint.
 */
function doGet() {
  return jsonResponse_({
    ok: false,
    error: 'Leitura publica desabilitada.'
  });
}

/**
 * Endpoint do comprador. A resposta usa postMessage para que o site estatico
 * consiga ler o resultado real do Apps Script sem recorrer a `no-cors`.
 */
function doPost(event) {
  let requestId = '';
  try {
    const request = parseBridgeRequest_(event);
    requestId = request.requestId;
    const result = dispatchBuyerAction_(request.action, request.payload, request.sessionToken);
    return bridgeResponse_(Object.assign({ ok: true }, result), requestId);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));

    if (error && error.name === 'PublicError') {
      return bridgeResponse_({
        ok: false,
        code: error.code,
        error: error.message
      }, requestId);
    }

    return bridgeResponse_({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Nao foi possivel concluir a operacao.'
    }, requestId);
  }
}

function dispatchBuyerAction_(action, payload, sessionToken) {
  if (action === 'getPublicConfig') {
    assertOnlyFields_(payload, []);
    return {
      pricesInCents: {
        ticket: CONFIG_.pricesInCents.ticket,
        popcorn: CONFIG_.pricesInCents.popcorn,
        soda: CONFIG_.pricesInCents.soda
      }
    };
  }
  if (action === 'requestVerification') {
    return requestEmailVerification_(payload);
  }
  if (action === 'verifyEmail') {
    return verifyEmailCode_(payload);
  }
  if (action === 'createOrder') {
    const email = requireBuyerSession_(sessionToken);
    const order = validateOrderPayload_(payload);
    const pixConfig = getPixConfig_();
    const saved = saveOrder_(order, email);
    const pixPayload = createPixPayload_(saved.id, saved.totalCents, pixConfig);
    return {
      duplicate: saved.duplicate,
      order: {
        id: saved.id,
        createdAt: saved.createdAt.toISOString(),
        totalCents: saved.totalCents,
        status: saved.status,
        statusToken: saved.statusToken,
        pixPayload: pixPayload,
        pricesInCents: {
          ticket: CONFIG_.pricesInCents.ticket,
          popcorn: CONFIG_.pricesInCents.popcorn,
          soda: CONFIG_.pricesInCents.soda
        }
      }
    };
  }
  if (action === 'getOrderStatus') {
    return { order: getOrderStatus_(payload) };
  }
  throw new PublicError_('INVALID_ACTION', 'Operacao invalida.');
}

function parseBridgeRequest_(event) {
  if (!event || !event.parameter) {
    throw new PublicError_('INVALID_BODY', 'Requisicao ausente.');
  }

  const action = typeof event.parameter.action === 'string' ? event.parameter.action : '';
  const requestId = normalizeBridgeRequestId_(event.parameter.requestId);
  const sessionToken = typeof event.parameter.sessionToken === 'string'
    ? event.parameter.sessionToken.trim()
    : '';
  const body = typeof event.parameter.payload === 'string' ? event.parameter.payload : '{}';

  if (!body || body.length > CONFIG_.maxPayloadBytes) {
    throw new PublicError_('INVALID_BODY', 'Corpo da requisicao invalido.');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new PublicError_('INVALID_JSON', 'JSON invalido.');
  }
  if (!isPlainObject_(payload)) {
    throw new PublicError_('INVALID_BODY', 'A requisicao deve ser um objeto JSON.');
  }

  return {
    action: action,
    requestId: requestId,
    sessionToken: sessionToken,
    payload: payload
  };
}

function normalizeBridgeRequestId_(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{16,64}$/i.test(value)) {
    throw new PublicError_('INVALID_REQUEST_ID', 'Identificador da requisicao invalido.');
  }
  return value.toLowerCase();
}

function parseRequestBody_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') {
    throw new PublicError_('INVALID_BODY', 'Corpo da requisicao ausente.');
  }

  const body = event.postData.contents;
  if (!body || body.length > CONFIG_.maxPayloadBytes) {
    throw new PublicError_('INVALID_BODY', 'Corpo da requisicao invalido.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new PublicError_('INVALID_JSON', 'JSON invalido.');
  }

  if (!isPlainObject_(parsed)) {
    throw new PublicError_('INVALID_BODY', 'O pedido deve ser um objeto JSON.');
  }

  return parsed;
}

function validateOrderPayload_(payload) {
  if (!isPlainObject_(payload)) {
    throw new PublicError_('INVALID_BODY', 'Pedido invalido.');
  }

  Object.keys(payload).forEach(function (field) {
    if (CONFIG_.acceptedPayloadFields.indexOf(field) === -1) {
      throw new PublicError_('UNEXPECTED_FIELD', 'O pedido contem um campo nao permitido.');
    }
  });

  const name = normalizeName_(payload.nome);
  const className = normalizeClass_(payload.turma);
  const wantsPopcorn = requireBoolean_(payload.querPipoca, 'querPipoca');
  const wantsSoda = requireBoolean_(payload.querRefri, 'querRefri');

  const popcornTypes = normalizePopcorn_(payload, wantsPopcorn);
  const requestId = normalizeRequestId_(payload.requestId);

  // O total enviado pelo navegador nunca e usado.
  const totalCents = CONFIG_.pricesInCents.ticket +
    (popcornTypes.length * CONFIG_.pricesInCents.popcorn) +
    (wantsSoda ? CONFIG_.pricesInCents.soda : 0);

  return Object.freeze({
    name: name,
    className: className,
    wantsPopcorn: wantsPopcorn,
    popcornTypes: popcornTypes,
    wantsSoda: wantsSoda,
    totalCents: totalCents,
    requestId: requestId
  });
}

function normalizeName_(value) {
  if (typeof value !== 'string') {
    throw new PublicError_('INVALID_NAME', 'Nome invalido.');
  }

  const normalized = normalizeText_(value);
  if (normalized.length < 3 || normalized.length > CONFIG_.maxNameLength) {
    throw new PublicError_('INVALID_NAME', 'Nome invalido.');
  }

  // Permite letras Unicode, espaco e pontuacao comum de nomes.
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’\-]{1,99}$/u.test(normalized)) {
    throw new PublicError_('INVALID_NAME', 'Nome invalido.');
  }

  return normalized;
}

function normalizeClass_(value) {
  if (typeof value !== 'string') {
    throw new PublicError_('INVALID_CLASS', 'Turma invalida.');
  }

  const normalized = removeAccents_(normalizeText_(value));
  const index = CONFIG_.allowedClasses.indexOf(normalized);
  if (index === -1) {
    throw new PublicError_('INVALID_CLASS', 'Turma invalida.');
  }

  return CONFIG_.allowedClasses[index];
}

function normalizePopcorn_(payload, wantsPopcorn) {
  let quantity = payload.quantidadePipoca;
  let types = payload.tiposPipoca;

  if (payload.tiposPipoca !== undefined && payload.tipoPipoca !== undefined) {
    throw new PublicError_('INVALID_POPCORN', 'Envie apenas um formato para os tipos de pipoca.');
  }

  if (types === undefined && typeof payload.tipoPipoca === 'string') {
    const legacy = normalizeText_(payload.tipoPipoca);
    types = legacy === 'N/A' || legacy === '' ? [] : legacy.split(',').map(function (item) {
      return normalizeText_(item);
    });
  }

  if (types === undefined) {
    types = [];
  }

  if (!Array.isArray(types)) {
    throw new PublicError_('INVALID_POPCORN', 'Tipos de pipoca invalidos.');
  }

  if (quantity === undefined) {
    quantity = types.length;
  }

  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    throw new PublicError_('INVALID_POPCORN', 'Quantidade de pipoca invalida.');
  }

  if (!wantsPopcorn) {
    if (quantity !== 0 || types.length !== 0) {
      throw new PublicError_('INVALID_POPCORN', 'Pedido de pipoca inconsistente.');
    }
    return [];
  }

  if (quantity < 1 || quantity > CONFIG_.maxPopcorn || types.length !== quantity) {
    throw new PublicError_('INVALID_POPCORN', 'Quantidade de pipoca invalida.');
  }

  return types.map(function (type) {
    if (typeof type !== 'string') {
      throw new PublicError_('INVALID_POPCORN', 'Tipo de pipoca invalido.');
    }
    const normalized = normalizeText_(type);
    if (CONFIG_.allowedPopcornTypes.indexOf(normalized) === -1) {
      throw new PublicError_('INVALID_POPCORN', 'Tipo de pipoca invalido.');
    }
    return normalized;
  });
}

function normalizeRequestId_(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value !== 'string' || !/^[a-f0-9-]{16,64}$/i.test(value)) {
    throw new PublicError_('INVALID_REQUEST_ID', 'Identificador da requisicao invalido.');
  }
  return value.toLowerCase();
}

function requireBoolean_(value, field) {
  if (typeof value !== 'boolean') {
    throw new PublicError_('INVALID_FIELD', 'Campo invalido: ' + field + '.');
  }
  return value;
}

function requestEmailVerification_(payload) {
  assertOnlyFields_(payload, ['email']);
  const email = requireInstitutionalEmail_(payload.email);
  const cache = CacheService.getScriptCache();
  const emailKey = sha256Hex_(email);
  const cooldownKey = 'otp-cooldown:' + emailKey;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (cache.get(cooldownKey)) {
      throw new PublicError_('TOO_MANY_REQUESTS', 'Aguarde um minuto antes de pedir outro codigo.');
    }

    const code = createVerificationCode_();
    cache.put('otp:' + emailKey, JSON.stringify({
      hash: hmacHex_(email + '|' + code),
      attempts: 0
    }), CONFIG_.verificationCodeTtlSeconds);
    cache.put(cooldownKey, '1', CONFIG_.verificationCooldownSeconds);

    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Codigo de acesso - Cine Infor',
        name: 'Cine Infor',
        body: 'Seu codigo de acesso ao Cine Infor e: ' + code +
          '\n\nEle expira em 10 minutos. Se voce nao pediu este codigo, ignore a mensagem.',
        htmlBody: '<p>Seu codigo de acesso ao Cine Infor e:</p>' +
          '<p style="font-size:26px;font-weight:bold;letter-spacing:4px">' + code + '</p>' +
          '<p>Ele expira em 10 minutos. Se voce nao pediu este codigo, ignore a mensagem.</p>'
      });
    } catch (error) {
      cache.remove('otp:' + emailKey);
      cache.remove(cooldownKey);
      throw error;
    }
  } finally {
    lock.releaseLock();
  }

  return {
    message: 'Codigo enviado para o e-mail institucional.',
    email: email
  };
}

function verifyEmailCode_(payload) {
  assertOnlyFields_(payload, ['email', 'code']);
  const email = requireInstitutionalEmail_(payload.email);
  const code = typeof payload.code === 'string' ? payload.code.replace(/\D/g, '') : '';
  if (!/^\d{6}$/.test(code)) {
    throw new PublicError_('INVALID_CODE', 'Digite o codigo de 6 numeros.');
  }

  const cache = CacheService.getScriptCache();
  const emailKey = sha256Hex_(email);
  const otpKey = 'otp:' + emailKey;
  const cached = cache.get(otpKey);
  if (!cached) {
    throw new PublicError_('CODE_EXPIRED', 'O codigo expirou. Solicite um novo.');
  }

  let verification;
  try {
    verification = JSON.parse(cached);
  } catch (error) {
    cache.remove(otpKey);
    throw new PublicError_('CODE_EXPIRED', 'O codigo expirou. Solicite um novo.');
  }

  const expected = String(verification.hash || '');
  const received = hmacHex_(email + '|' + code);
  if (!constantTimeEquals_(expected, received)) {
    verification.attempts = Number(verification.attempts || 0) + 1;
    if (verification.attempts >= CONFIG_.maxVerificationAttempts) {
      cache.remove(otpKey);
      throw new PublicError_('CODE_BLOCKED', 'Muitas tentativas. Solicite um novo codigo.');
    }
    cache.put(otpKey, JSON.stringify(verification), CONFIG_.verificationCodeTtlSeconds);
    throw new PublicError_('INVALID_CODE', 'Codigo incorreto.');
  }

  cache.remove(otpKey);
  const sessionToken = createOpaqueToken_();
  cache.put(
    'buyer-session:' + sha256Hex_(sessionToken),
    email,
    CONFIG_.buyerSessionTtlSeconds
  );

  return {
    message: 'E-mail institucional confirmado.',
    email: email,
    sessionToken: sessionToken,
    expiresInSeconds: CONFIG_.buyerSessionTtlSeconds
  };
}

function requireBuyerSession_(sessionToken) {
  if (typeof sessionToken !== 'string' || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    throw new PublicError_('AUTH_REQUIRED', 'Confirme seu e-mail institucional novamente.');
  }
  const email = CacheService.getScriptCache().get(
    'buyer-session:' + sha256Hex_(sessionToken.toLowerCase())
  );
  if (!email) {
    throw new PublicError_('SESSION_EXPIRED', 'Sua confirmacao expirou. Confirme o e-mail novamente.');
  }
  return requireInstitutionalEmail_(email);
}

function requireInstitutionalEmail_(value) {
  const properties = PropertiesService.getScriptProperties();
  const domain = normalizeDomain_(properties.getProperty('INSTITUTIONAL_DOMAIN'));
  if (!domain) {
    throw new Error('INSTITUTIONAL_DOMAIN nao configurado.');
  }
  const email = normalizeEmail_(value);
  if (!isInstitutionalEmail_(email, domain)) {
    throw new PublicError_('ACCESS_DENIED', 'Use a conta institucional autorizada.');
  }
  return email;
}

function createVerificationCode_() {
  const hex = sha256Hex_(Utilities.getUuid() + '|' + new Date().getTime());
  return String(parseInt(hex.substring(0, 12), 16) % 1000000).padStart(6, '0');
}

function createOpaqueToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

function getAuthSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET nao configurado. Execute configurarProjeto().');
  }
  return secret;
}

function hmacHex_(value) {
  const bytes = Utilities.computeHmacSha256Signature(value, getAuthSecret_());
  return bytesToHex_(bytes);
}

function bytesToHex_(bytes) {
  return bytes.map(function (byte) {
    return ((byte < 0 ? byte + 256 : byte).toString(16)).padStart(2, '0');
  }).join('');
}

function constantTimeEquals_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function assertOnlyFields_(payload, allowedFields) {
  if (!isPlainObject_(payload)) {
    throw new PublicError_('INVALID_BODY', 'Dados invalidos.');
  }
  Object.keys(payload).forEach(function (field) {
    if (allowedFields.indexOf(field) === -1) {
      throw new PublicError_('UNEXPECTED_FIELD', 'A requisicao contem um campo nao permitido.');
    }
  });
}

function saveOrder_(order, email) {
  const spreadsheet = openConfiguredSpreadsheet_();
  const sheet = requireConfiguredSheet_(spreadsheet, CONFIG_.sheetName, ORDER_HEADERS_);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const requestKey = buildRequestKey_(order, email, Date.now());
    const existing = findOrderByRequestKey_(sheet, requestKey);
    if (existing) {
      existing.statusToken = order.requestId;
      return existing;
    }

    enforceRateLimit_(sheet, email, new Date());

    const now = new Date();
    const orderId = createOrderId_();
    const statusToken = order.requestId || createOpaqueToken_();
    const row = [
      spreadsheetSafeText_(orderId),
      now,
      spreadsheetSafeText_(email),
      spreadsheetSafeText_(order.name),
      spreadsheetSafeText_(order.className),
      1,
      order.popcornTypes.length,
      spreadsheetSafeText_(order.popcornTypes.join(', ')),
      order.wantsSoda ? 1 : 0,
      order.totalCents,
      formatCurrency_(order.totalCents),
      CONFIG_.status.waiting,
      '',
      '',
      '',
      '',
      requestKey,
      now,
      CONFIG_.status.waiting,
      hmacHex_(statusToken)
    ];

    sheet.appendRow(row);
    const rowNumber = sheet.getLastRow();
    sheet.getRange(rowNumber, COL_.createdAt).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(rowNumber, COL_.paidAt, 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(rowNumber, COL_.usedAt, 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(rowNumber, COL_.updatedAt, 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    SpreadsheetApp.flush();

    return {
      duplicate: false,
      id: orderId,
      createdAt: now,
      totalCents: order.totalCents,
      status: CONFIG_.status.waiting,
      statusToken: statusToken
    };
  } finally {
    lock.releaseLock();
  }
}

function enforceRateLimit_(sheet, email, now) {
  const configured = Number(PropertiesService.getScriptProperties().getProperty('MAX_ORDERS_PER_EMAIL_PER_HOUR'));
  const limit = Number.isInteger(configured) && configured > 0
    ? configured
    : CONFIG_.defaultOrdersPerHour;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, COL_.createdAt, lastRow - 1, 2).getValues();
  const cutoff = now.getTime() - (60 * 60 * 1000);
  let count = 0;
  values.forEach(function (row) {
    const createdAt = row[0];
    const storedEmail = normalizeEmail_(row[1]);
    if (storedEmail === email && createdAt instanceof Date && createdAt.getTime() >= cutoff) {
      count += 1;
    }
  });

  if (count >= limit) {
    throw new PublicError_('RATE_LIMITED', 'Limite de pedidos atingido. Procure um organizador.');
  }
}

function findOrderByRequestKey_(sheet, requestKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const found = sheet
    .getRange(2, COL_.requestKey, lastRow - 1, 1)
    .createTextFinder(requestKey)
    .matchEntireCell(true)
    .findNext();

  if (!found) return null;

  const row = sheet.getRange(found.getRow(), 1, 1, ORDER_HEADERS_.length).getValues()[0];
  return {
    duplicate: true,
    id: String(row[COL_.id - 1]),
    createdAt: row[COL_.createdAt - 1] instanceof Date ? row[COL_.createdAt - 1] : new Date(row[COL_.createdAt - 1]),
    totalCents: Number(row[COL_.totalCents - 1]),
    status: String(row[COL_.status - 1])
  };
}

function getOrderStatus_(payload) {
  assertOnlyFields_(payload, ['orderId', 'statusToken']);
  const orderId = typeof payload.orderId === 'string' ? payload.orderId.trim().toUpperCase() : '';
  const statusToken = typeof payload.statusToken === 'string' ? payload.statusToken.trim().toLowerCase() : '';
  if (!/^CI-[A-F0-9]{32}$/.test(orderId) || !/^[a-f0-9-]{16,64}$/.test(statusToken)) {
    throw new PublicError_('ORDER_NOT_FOUND', 'Pedido nao encontrado.');
  }

  const spreadsheet = openConfiguredSpreadsheet_();
  const sheet = requireConfiguredSheet_(spreadsheet, CONFIG_.sheetName, ORDER_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new PublicError_('ORDER_NOT_FOUND', 'Pedido nao encontrado.');
  }

  const found = sheet
    .getRange(2, COL_.id, lastRow - 1, 1)
    .createTextFinder(orderId)
    .matchEntireCell(true)
    .findNext();
  if (!found) {
    throw new PublicError_('ORDER_NOT_FOUND', 'Pedido nao encontrado.');
  }

  const row = sheet.getRange(found.getRow(), 1, 1, ORDER_HEADERS_.length).getValues()[0];
  const expectedHash = String(row[COL_.statusTokenHash - 1] || '');
  if (!constantTimeEquals_(expectedHash, hmacHex_(statusToken))) {
    throw new PublicError_('ORDER_NOT_FOUND', 'Pedido nao encontrado.');
  }

  const paidAt = row[COL_.paidAt - 1];
  return {
    id: String(row[COL_.id - 1]),
    status: String(row[COL_.confirmedStatus - 1] || row[COL_.status - 1]),
    paidAt: paidAt instanceof Date ? paidAt.toISOString() : null,
    updatedAt: row[COL_.updatedAt - 1] instanceof Date
      ? row[COL_.updatedAt - 1].toISOString()
      : null
  };
}

function buildRequestKey_(order, email, timestamp) {
  const basis = order.requestId
    ? email + '|request|' + order.requestId
    : [
        email,
        order.name,
        order.className,
        order.popcornTypes.join(','),
        order.wantsSoda ? '1' : '0',
        String(Math.floor(timestamp / CONFIG_.duplicateWindowMs))
      ].join('|');
  return sha256Hex_(basis);
}

function createOrderId_() {
  return 'CI-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    return ((byte < 0 ? byte + 256 : byte).toString(16)).padStart(2, '0');
  }).join('');
}

/**
 * Execute manualmente UMA VEZ, usando a conta tecnica responsavel.
 * Cria as abas, protecoes, validacoes e o gatilho instalavel de auditoria.
 */
function configurarProjeto() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('AUTH_SECRET')) {
    properties.setProperty('AUTH_SECRET', createOpaqueToken_() + createOpaqueToken_());
  }

  const spreadsheet = openConfiguredSpreadsheet_();
  const orders = ensureSheet_(spreadsheet, CONFIG_.sheetName, ORDER_HEADERS_);
  const audit = ensureSheet_(spreadsheet, CONFIG_.auditSheetName, AUDIT_HEADERS_);

  styleAndProtectOrders_(orders);
  styleAndProtectAudit_(audit);
  installEditTrigger_(spreadsheet);

  console.log('Configuracao concluida para: ' + spreadsheet.getUrl());
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    migrateOrderSheetIfNeeded_(sheet, name);
    assertHeaders_(sheet, headers);
  }
  return sheet;
}

function migrateOrderSheetIfNeeded_(sheet, name) {
  if (name !== CONFIG_.sheetName) return;
  const oldHeaders = ORDER_HEADERS_.slice(0, ORDER_HEADERS_.length - 1);
  const actual = sheet.getRange(1, 1, 1, oldHeaders.length).getDisplayValues()[0];
  if (actual.join('|') === oldHeaders.join('|') && !sheet.getRange(1, COL_.statusTokenHash).getValue()) {
    sheet.getRange(1, COL_.statusTokenHash).setValue(ORDER_HEADERS_[COL_.statusTokenHash - 1]);
  }
}

function requireConfiguredSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Aba nao configurada: ' + name);
  assertHeaders_(sheet, headers);
  return sheet;
}

function assertHeaders_(sheet, expectedHeaders) {
  const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
  if (actual.join('|') !== expectedHeaders.join('|')) {
    throw new Error('Cabecalhos inesperados na aba ' + sheet.getName() + '.');
  }
}

function styleAndProtectOrders_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ORDER_HEADERS_.length).setFontWeight('bold');
  sheet.hideColumns(COL_.requestKey);
  sheet.hideColumns(COL_.confirmedStatus);
  sheet.hideColumns(COL_.statusTokenHash);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      CONFIG_.status.waiting,
      CONFIG_.status.paid,
      CONFIG_.status.used
    ], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL_.status, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);

  replaceProtection_(sheet, 'Cine Infor - dados protegidos', [
    sheet.getRange(2, COL_.status, Math.max(sheet.getMaxRows() - 1, 1), 1)
  ]);
}

function styleAndProtectAudit_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, AUDIT_HEADERS_.length).setFontWeight('bold');
  replaceProtection_(sheet, 'Cine Infor - auditoria protegida', []);
}

function replaceProtection_(sheet, description, unprotectedRanges) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (protection) {
    if (protection.getDescription() === description && protection.canEdit()) {
      protection.remove();
    }
  });

  const protection = sheet.protect().setDescription(description);
  protection.setWarningOnly(false);
  protection.setUnprotectedRanges(unprotectedRanges);

  const effectiveEmail = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (effectiveEmail) protection.addEditor(effectiveEmail);

  const removable = protection.getEditors().filter(function (user) {
    return normalizeEmail_(user.getEmail()) !== effectiveEmail;
  });
  if (removable.length) protection.removeEditors(removable);
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function installEditTrigger_(spreadsheet) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'aoEditarStatusSeguro') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('aoEditarStatusSeguro')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();
}

/** Gatilho instalavel: aplica a maquina de estados e registra auditoria. */
function aoEditarStatusSeguro(event) {
  if (!event || !event.range) return;

  const range = event.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== CONFIG_.sheetName || range.getRow() < 2) return;

  const touchesStatus = range.getColumn() <= COL_.status && range.getLastColumn() >= COL_.status;
  if (!touchesStatus) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (range.getNumRows() !== 1 || range.getNumColumns() !== 1 || range.getColumn() !== COL_.status) {
      restoreConfirmedStatuses_(sheet, range.getRow(), range.getNumRows());
      notifySpreadsheet_(event, 'Altere apenas um status por vez. A edicao em bloco foi bloqueada.');
      return;
    }

    const previous = String(sheet.getRange(range.getRow(), COL_.confirmedStatus).getDisplayValue());
    const next = event.value === undefined ? '' : String(event.value);
    const actor = eventUserEmail_(event);

    if (!actor || !isAdminEmail_(actor)) {
      restorePreviousValue_(range, previous);
      appendAudit_(event.source, range.getRow(), previous, next, actor || 'nao-identificado', 'NEGADO');
      notifySpreadsheet_(event, 'Alteracao negada: conta nao autorizada.');
      return;
    }

    if (!isAllowedTransition_(previous, next)) {
      restorePreviousValue_(range, previous);
      appendAudit_(event.source, range.getRow(), previous, next, actor, 'TRANSICAO_INVALIDA');
      notifySpreadsheet_(event, 'Transicao invalida. Use Aguardando > Pago > Utilizado.');
      return;
    }

    const now = new Date();
    if (next === CONFIG_.status.paid) {
      sheet.getRange(range.getRow(), COL_.paidAt).setValue(now);
      sheet.getRange(range.getRow(), COL_.paidBy).setValue(spreadsheetSafeText_(actor));
    } else if (next === CONFIG_.status.used) {
      sheet.getRange(range.getRow(), COL_.usedAt).setValue(now);
      sheet.getRange(range.getRow(), COL_.usedBy).setValue(spreadsheetSafeText_(actor));
    }
    sheet.getRange(range.getRow(), COL_.updatedAt).setValue(now);
    sheet.getRange(range.getRow(), COL_.confirmedStatus).setValue(next);
    appendAudit_(event.source, range.getRow(), previous, next, actor, 'ACEITO');
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

function isAllowedTransition_(previous, next) {
  return (previous === CONFIG_.status.waiting && next === CONFIG_.status.paid) ||
    (previous === CONFIG_.status.paid && next === CONFIG_.status.used);
}

function isAdminEmail_(email) {
  const configured = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  const allowed = configured.split(',').map(normalizeEmail_).filter(Boolean);
  return allowed.indexOf(normalizeEmail_(email)) !== -1;
}

function eventUserEmail_(event) {
  try {
    if (event.user && event.user.getEmail()) return normalizeEmail_(event.user.getEmail());
  } catch (error) {
    // Falha fechada abaixo.
  }
  return '';
}

function restorePreviousValue_(range, previous) {
  if (previous === '') range.clearContent();
  else range.setValue(previous);
}

function restoreConfirmedStatuses_(sheet, firstRow, numberOfRows) {
  const idsAndConfirmed = sheet
    .getRange(firstRow, COL_.id, numberOfRows, COL_.confirmedStatus)
    .getValues();
  const confirmed = idsAndConfirmed.map(function (row) {
      const orderId = row[COL_.id - 1];
      const confirmedStatus = row[COL_.confirmedStatus - 1];
      return [orderId ? (confirmedStatus || CONFIG_.status.waiting) : ''];
    });
  sheet.getRange(firstRow, COL_.status, numberOfRows, 1).setValues(confirmed);
}

function appendAudit_(spreadsheet, rowNumber, previous, next, actor, result) {
  const orders = spreadsheet.getSheetByName(CONFIG_.sheetName);
  const audit = spreadsheet.getSheetByName(CONFIG_.auditSheetName);
  if (!orders || !audit) throw new Error('Abas de auditoria nao configuradas.');

  const orderId = orders.getRange(rowNumber, COL_.id).getDisplayValue();
  audit.appendRow([
    new Date(),
    spreadsheetSafeText_(orderId),
    spreadsheetSafeText_(previous),
    spreadsheetSafeText_(next),
    spreadsheetSafeText_(actor),
    spreadsheetSafeText_(result)
  ]);
}

function notifySpreadsheet_(event, message) {
  try {
    event.source.toast(message, 'Cine Infor', 6);
  } catch (error) {
    console.warn(message);
  }
}

function openConfiguredSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id || !/^[a-zA-Z0-9_-]{20,}$/.test(id)) {
    throw new Error('SPREADSHEET_ID nao configurado.');
  }
  return SpreadsheetApp.openById(id);
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function bridgeResponse_(value, requestId) {
  const origins = getAllowedOrigins_();
  const envelope = Object.assign({
    source: 'cine-infor-backend',
    requestId: requestId || ''
  }, value);
  const encoded = Utilities.base64Encode(
    JSON.stringify(envelope),
    Utilities.Charset.UTF_8
  );
  const html = '<!doctype html><meta charset="utf-8"><script>' +
    '(function(){' +
      'var binary=atob(' + JSON.stringify(encoded) + ');' +
      'var bytes=Uint8Array.from(binary,function(c){return c.charCodeAt(0);});' +
      'var data=JSON.parse(new TextDecoder().decode(bytes));' +
      'var origins=' + JSON.stringify(origins) + ';' +
      'origins.forEach(function(origin){window.top.postMessage(data,origin);});' +
    '}());' +
    '</script>';
  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAllowedOrigins_() {
  const configured = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS') || '';
  const origins = configured.split(',').map(function (origin) {
    return origin.trim().replace(/\/$/, '');
  }).filter(function (origin) {
    return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
  });
  if (!origins.length) {
    throw new Error('ALLOWED_ORIGINS nao configurado.');
  }
  return origins;
}

function normalizeText_(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function removeAccents_(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeEmail_(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeDomain_(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/^@/, '');
}

function isInstitutionalEmail_(email, domain) {
  const normalizedEmail = normalizeEmail_(email);
  const normalizedDomain = normalizeDomain_(domain);
  if (!normalizedEmail || !normalizedDomain) return false;
  const parts = normalizedEmail.split('@');
  return parts.length === 2 &&
    parts[0].length > 0 &&
    parts[0].length <= 64 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) &&
    parts[1] === normalizedDomain;
}

function isPlainObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function spreadsheetSafeText_(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function formatCurrency_(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}

function getPixConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const key = String(properties.getProperty('PIX_KEY') || '').trim();
  const receiverName = sanitizePixText_(properties.getProperty('PIX_RECEIVER_NAME'), 25);
  const city = sanitizePixText_(properties.getProperty('PIX_CITY'), 15);
  if (!key || key.length > 77 || receiverName.length < 2 || city.length < 2) {
    throw new Error('PIX_KEY, PIX_RECEIVER_NAME ou PIX_CITY nao configurado.');
  }
  return { key: key, receiverName: receiverName, city: city };
}

function createPixPayload_(orderId, totalCents, pixConfig) {
  const key = pixConfig.key;
  const receiverName = pixConfig.receiverName;
  const city = pixConfig.city;

  const txid = String(orderId || 'CINEINFOR')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 25) || '***';
  const merchantAccount = emvField_('00', 'BR.GOV.BCB.PIX') + emvField_('01', key);
  const additionalData = emvField_('05', txid);
  const withoutCrc = emvField_('00', '01') +
    emvField_('26', merchantAccount) +
    emvField_('52', '0000') +
    emvField_('53', '986') +
    emvField_('54', (Number(totalCents) / 100).toFixed(2)) +
    emvField_('58', 'BR') +
    emvField_('59', receiverName) +
    emvField_('60', city) +
    emvField_('62', additionalData) +
    '6304';
  return withoutCrc + crc16Pix_(withoutCrc);
}

function sanitizePixText_(value, maxLength) {
  return removeAccents_(String(value || ''))
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, '')
    .trim()
    .substring(0, maxLength);
}

function emvField_(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16Pix_(payload) {
  let crc = 0xFFFF;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
