const SPREADSHEET_ID = '';

const TRANSACTION_HEADERS = ['id', 'type', 'amount', 'date', 'category', 'note', 'loanId', 'createdAt'];
const CATEGORY_HEADERS = ['name', 'type', 'createdAt'];
const BUDGET_HEADERS = ['id', 'category', 'month', 'amount', 'createdAt'];
const GOAL_HEADERS = ['name', 'target', 'saved'];
const LOAN_HEADERS = ['id', 'name', 'principal', 'remaining', 'date', 'note', 'createdAt'];

function ss() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = e?.parameter?.action || '';
    if (action === 'getAll') return json({ ok: true, data: readAll() });
    if (action === 'status') return json({ ok: true, data: status() });
    return json({ ok: true, message: 'MoneyFlow API is running' });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const request = JSON.parse(e?.postData?.contents || '{}');
    if (request.action === 'getAll') return json({ ok: true, data: readAll() });
    if (request.action === 'status') return json({ ok: true, data: status() });
    if (request.action === 'appendDelta') return json({ ok: true, data: appendDelta(request) });
    if (request.action === 'replaceAll' || request.action === 'writeAll') return json({ ok: true, data: writeAll(request) });
    return json({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function sheet(name, headers) {
  const book = ss();
  const target = book.getSheetByName(name) || book.insertSheet(name);
  if (target.getLastRow() === 0) target.getRange(1, 1, 1, headers.length).setValues([headers]);
  target.setFrozenRows(1);
  return target;
}

function rows(name, headers) {
  const values = sheet(name, headers).getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter((row) => row.some((value) => value !== '')).map((row) => {
    const item = {};
    headers.forEach((header, index) => { item[header] = row[index]; });
    return item;
  });
}

function num(value) {
  const result = Number(String(value == null ? '' : value).replace(/,/g, ''));
  return isFinite(result) ? result : 0;
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function iso(value) {
  const date = value ? new Date(value) : new Date();
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function formatDate(value) {
  if (!value) return today();
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : today();
}

function normalizeTransaction(value) {
  const item = value || {};
  let type = String(item.type || 'expense');
  const category = String(item.category || 'General');
  if (category.toLowerCase() === 'loan') type = 'income';
  if (category.toLowerCase() === 'loan repayment' || category.toLowerCase() === 'loan payback') type = 'expense';
  return { id: String(item.id || Utilities.getUuid()), type, amount: num(item.amount), date: formatDate(item.date), category, note: String(item.note || ''), loanId: String(item.loanId || ''), createdAt: iso(item.createdAt) };
}

function normalizeCategory(value) {
  const item = value || {};
  return { name: String(item.name || '').trim(), type: String(item.type || 'expense'), createdAt: iso(item.createdAt) };
}

function normalizeBudget(value) {
  const item = value || {};
  return { id: String(item.id || Utilities.getUuid()), category: String(item.category || '').trim(), month: String(item.month || '').slice(0, 7), amount: num(item.amount), createdAt: iso(item.createdAt) };
}

function normalizeLoan(value) {
  const item = value || {};
  const principal = num(item.principal || item.amount);
  return { id: String(item.id || Utilities.getUuid()), name: String(item.name || 'Loan').trim(), principal, remaining: Math.max(0, num(item.remaining === undefined ? (item.balance === undefined ? principal : item.balance) : item.remaining)), date: formatDate(item.date), note: String(item.note || ''), createdAt: iso(item.createdAt) };
}

function uniqueCategories(values) {
  const result = [];
  values.forEach((value) => {
    const item = normalizeCategory(value);
    if (!item.name) return;
    if (!result.some((existing) => existing.name.toLowerCase() === item.name.toLowerCase() && existing.type === item.type)) result.push(item);
  });
  return result;
}

function keyFor(item, field) { return String(item && item[field] !== undefined ? item[field] : ''); }

function upsertTable(name, headers, values, field) {
  const target = sheet(name, headers);
  const existingRows = rows(name, headers);
  const merged = [...existingRows, ...values].reduce((result, item) => {
    const key = keyFor(item, field);
    if (!key) return result;
    const index = result.findIndex((entry) => keyFor(entry, field) === key);
    if (index >= 0) result[index] = item;
    else result.push(item);
    return result;
  }, []);
  target.clearContents();
  target.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (merged.length) target.getRange(2, 1, merged.length, headers.length).setValues(merged.map((item) => headers.map((header) => item[header] ?? '')));
  target.setFrozenRows(1);
}

function appendDelta(payload) {
  const transactions = (payload.transactions || []).map(normalizeTransaction).filter((item) => item.id && item.category);
  const categories = uniqueCategories(payload.categories || []).filter((item) => item.name);
  const budgets = (payload.budgets || []).map(normalizeBudget).filter((item) => item.category && item.month);
  const loans = (payload.loans || []).map(normalizeLoan).filter((item) => item.id);
  if (transactions.length) upsertTable('Transactions', TRANSACTION_HEADERS, transactions, 'id');
  if (categories.length) upsertTable('Categories', CATEGORY_HEADERS, categories, 'name');
  if (budgets.length) upsertTable('Budgets', BUDGET_HEADERS, budgets, 'id');
  if (loans.length) upsertTable('Loans', LOAN_HEADERS, loans, 'id');
  return { synced: true, counts: { transactions: transactions.length, categories: categories.length, budgets: budgets.length, loans: loans.length } };
}

function readAll() {
  return {
    transactions: rows('Transactions', TRANSACTION_HEADERS).map(normalizeTransaction),
    categories: uniqueCategories(rows('Categories', CATEGORY_HEADERS)),
    budgets: rows('Budgets', BUDGET_HEADERS).map(normalizeBudget).filter((item) => item.category),
    loans: rows('Loans', LOAN_HEADERS).map(normalizeLoan)
  };
}

function status() {
  const data = readAll();
  return { count: data.transactions.length, categoryCount: data.categories.length, budgetCount: data.budgets.length, loanCount: data.loans.length };
}

function writeAll(payload) {
  const transactions = (payload.transactions || []).map(normalizeTransaction);
  const categories = uniqueCategories(payload.categories || []);
  const budgets = (payload.budgets || []).map(normalizeBudget).filter((item) => item.category);
  const loans = (payload.loans || []).map(normalizeLoan).filter((item) => item.id);
  const writeTable = (name, headers, values) => {
    const target = sheet(name, headers);
    target.clearContents();
    target.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (values.length) target.getRange(2, 1, values.length, headers.length).setValues(values);
    target.setFrozenRows(1);
  };
  writeTable('Transactions', TRANSACTION_HEADERS, transactions.map((tx) => [tx.id, tx.type, tx.amount, tx.date, tx.category, tx.note, tx.loanId, tx.createdAt]));
  writeTable('Categories', CATEGORY_HEADERS, categories.map((item) => [item.name, item.type, item.createdAt]));
  writeTable('Budgets', BUDGET_HEADERS, budgets.map((item) => [item.id, item.category, item.month, item.amount, item.createdAt]));
  writeTable('Loans', LOAN_HEADERS, loans.map((item) => [item.id, item.name, item.principal, item.remaining, item.date, item.note, item.createdAt]));
  return readAll();
}
