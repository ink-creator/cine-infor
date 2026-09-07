/**
 * Backend seguro do Cine Infor para Google Apps Script (runtime V8).
 *
 * Este projeto deve ser criado como um Apps Script INDEPENDENTE. Nao vincule o
 * codigo a planilha: assim, editores da planilha nao ganham acesso ao backend.
 * A unica superficie HTTP publicada e doPost(), que cria pedidos.
 */

const CONFIG_ = Object.freeze({
  sheetName: 'Pedidos_Seguro',
  auditSheetName: 'Auditoria',
  maxPayloadBytes: 4096,
  maxNameLength: 100,
  maxPopcorn: 4,
  duplicateWindowMs: 30000,
  defaultOrdersPerHour: 5,
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
    'requestId',
    // Temporariamente aceito para compatibilidade com o site atual, mas ignorado.
    'total'
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
  'STATUS_CONFIRMADO'
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
  confirmedStatus: 19
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

/** Cria um pedido. Nenhuma outra acao HTTP e aceita. */
function doPost(event) {
  try {
    const email = requireInstitutionalUser_();
    const payload = parseRequestBody_(event);
    const order = validateOrderPayload_(payload);
    const saved = saveOrder_(order, email);

    return jsonResponse_({
      ok: true,
      duplicate: saved.duplicate,
      order: {
        id: saved.id,
        createdAt: saved.createdAt.toISOString(),
        totalCents: saved.totalCents,
        status: saved.status
      }
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));

    if (error && error.name === 'PublicError') {
      return jsonResponse_({
        ok: false,
        code: error.code,
        error: error.message
      });
    }

    return jsonResponse_({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Nao foi possivel registrar o pedido.'
    });
  }
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

  if (payload.total !== undefined &&
      typeof payload.total !== 'string' &&
      typeof payload.total !== 'number') {
    throw new PublicError_('INVALID_FIELD', 'Campo invalido: total.');
  }

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

function requireInstitutionalUser_() {
  const properties = PropertiesService.getScriptProperties();
  const requireEmail = properties.getProperty('REQUIRE_INSTITUTIONAL_EMAIL') !== 'false';
  const domain = normalizeDomain_(properties.getProperty('INSTITUTIONAL_DOMAIN'));

  // A configuracao padrao e fechada: sem dominio configurado, ninguem entra.
  if (requireEmail && !domain) {
    throw new Error('INSTITUTIONAL_DOMAIN nao configurado.');
  }

  let email = '';
  try {
    email = normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (error) {
    email = '';
  }

  if (requireEmail && (!email || !isInstitutionalEmail_(email, domain))) {
    throw new PublicError_('ACCESS_DENIED', 'Use a conta institucional autorizada.');
  }

  return email || 'nao-identificado';
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
      return existing;
    }

    enforceRateLimit_(sheet, email, new Date());

    const now = new Date();
    const orderId = createOrderId_();
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
      CONFIG_.status.waiting
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
      status: CONFIG_.status.waiting
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
    assertHeaders_(sheet, headers);
  }
  return sheet;
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
  return parts.length === 2 && parts[0].length > 0 && parts[1] === normalizedDomain;
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
