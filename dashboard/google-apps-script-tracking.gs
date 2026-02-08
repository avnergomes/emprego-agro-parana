/**
 * Google Apps Script para tracking do Dashboard Emprego Agro Parana
 *
 * PASSO A PASSO PARA CONFIGURACAO:
 * 1. Crie uma nova planilha no Google Sheets
 * 2. Copie o ID da planilha (da URL: docs.google.com/spreadsheets/d/[ID]/edit)
 * 3. Cole TODO este codigo no Google Apps Script (script.google.com)
 * 4. Substitua 'SEU_SPREADSHEET_ID_AQUI' pelo ID copiado
 * 5. Salve o projeto
 * 6. Execute a funcao setupSheet() uma vez
 * 7. Implante como Web App:
 *    - Tipo: Aplicativo da Web
 *    - Executar como: Eu
 *    - Acesso: Qualquer pessoa
 * 8. Copie a URL gerada e atualize TRACKING_URL no index.html
 */

const SPREADSHEET_ID = 'SEU_SPREADSHEET_ID_AQUI';
const SHEET_NAME = 'Tracking Data';

// ─── Seguranca ──────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://avnergomes.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 60;
const MAX_PAYLOAD_SIZE = 10000;

function isAllowedOrigin_(data) {
  var origin = data.origin || '';
  if (!origin) return false;  // Rejeitar sem origin (corrigido)
  return ALLOWED_ORIGINS.includes(origin);  // Match exato (corrigido)
}

function checkRateLimit_(sessionId) {
  if (!sessionId) return true;
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + sessionId;
  var current = cache.get(key);
  var count = current ? parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW_SEC);
  return true;
}

function validatePayload_(raw) {
  if (!raw || raw.length > MAX_PAYLOAD_SIZE) return null;
  try {
    var data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function jsonError_(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error', message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}

// ─── Endpoints ───────────────────────────────────

function doPost(e) {
  try {
    var data = validatePayload_(e.postData.contents);
    if (!data) return jsonError_('invalid payload');
    if (!isAllowedOrigin_(data)) return jsonError_('forbidden');
    if (!checkRateLimit_(data.sessionId || '')) return jsonError_('rate limited');

    saveToSheet(data);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Dados salvos com sucesso'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Emprego Agro Parana Tracking API funcionando',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ─── Salvar dados ────────────────────────────────

function saveToSheet(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    var keys = Object.keys(data);
    sheet.getRange(1, 1, 1, keys.length).setValues([keys]);
    var headerRange = sheet.getRange(1, 1, 1, keys.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#166534');  // Verde agro
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = headers.map(function (col) {
    var value = data[col];
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  });

  var nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);
}

// ─── Setup ───────────────────────────────────────

function setupSheet() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
  }
  sheet = spreadsheet.insertSheet(SHEET_NAME);
  sheet.setFrozenRows(1);
  Logger.log('Sheet "' + SHEET_NAME + '" criada com sucesso!');
}
