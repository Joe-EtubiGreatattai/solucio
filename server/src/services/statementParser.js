const pdf = require('pdf-parse');

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
// Statement amounts always include two decimal places. Requiring them prevents account
// numbers, phone numbers, and transfer references from being mistaken for money.
const MONEY = /(?:NGN|₦)?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g;
const VALUE_DATE = /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}-[A-Z]{3}-(?:\d{2}(?=[A-Z\s]|$)|\d{4}\b))/i;

const amountToKobo = (value) => Math.round(Number(value.replace(/,/g, '')) * 100);

function parseDate(line) {
  const numeric = line.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    let [, day, month, year] = numeric;
    if (year.length === 2) year = `20${year}`;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : { date, end: numeric[0].length };
  }
  const named = line.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})(?=\d{1,2}-[A-Z]{3}-|\b)/i)
    || line.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})\b/i);
  if (!named) return null;
  let [, day, month, year] = named;
  if (year.length === 2) year = `20${year}`;
  const monthIndex = MONTHS[month.toUpperCase()];
  if (monthIndex == null) return null;
  const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
  return Number.isNaN(date.getTime()) ? null : { date, end: named[0].length };
}

function parseTransaction({ date, parts }) {
  const body = parts.join(' ').replace(/\s+/g, ' ').trim().replace(VALUE_DATE, '').trim();
  const numbers = [...body.matchAll(MONEY)].map((match) => ({ value: match[1], index: match.index }));
  if (numbers.length < 2 || /opening balance/i.test(body)) return null;

  const amountToken = numbers[0];
  const narration = body.slice(0, amountToken.index).trim();
  const amount = amountToKobo(amountToken.value);
  if (!narration || amount <= 0) return null;

  // A dash immediately before the first amount means Debit is blank, so the first
  // amount belongs to Credit. Otherwise it is a Debit.
  const direction = narration.endsWith('-') ? 'income' : 'expense';
  const cleanNarration = narration.replace(/-\s*$/, '').trim();
  const referenceMatch = cleanNarration.match(/\b(?:ref|rrn|ft|nip)[:\s-]*([a-z0-9-]{5,})\b/i);
  return { date, narration: cleanNarration, reference: referenceMatch?.[1] || '', amount, direction };
}

// Zenith Bank: each row opens with the posting and value dates run together (01/01/202601/01/2026), the
// description wraps freely (often onto lines that look like dates), and the row closes with a line ending in
// "NGN <amount>NGN <balance>". Debit and credit share one amount column in the text, so direction comes from
// how the running balance moved.
const ZENITH_ROW = /^(\d{2})\/(\d{2})\/(\d{4})\d{2}\/\d{2}\/\d{4}(.*)$/;
const ZENITH_END = /NGN\s*([\d,]+\.\d{2})\s*NGN\s*(-?[\d,]+\.\d{2})\s*$/;
const ZENITH_HEADER = /^(?:Create Date\s*Effective Date|CLEARED ITEMS|UNCLEARED ITEMS)/i;
const isZenith = (text) => /Create Date\s*Effective Date/i.test(text);

function parseZenith(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const opening = text.match(/\d{2}\/\d{2}\/\d{4}NGN\s*(-?[\d,]+\.\d{2})/);
  let balance = opening ? amountToKobo(opening[1]) : null;
  const transactions = [];
  let current = null;

  for (const line of lines) {
    const start = line.match(ZENITH_ROW);
    if (start) {
      const [, day, month, year, rest] = start;
      current = { date: new Date(`${year}-${month}-${day}T00:00:00.000Z`), parts: [rest] };
    } else if (!current || ZENITH_HEADER.test(line)) {
      continue;
    } else {
      current.parts.push(line);
    }

    const joined = current.parts.join(' ');
    const end = joined.match(ZENITH_END);
    if (!end) continue;
    const amount = amountToKobo(end[1]);
    const next = amountToKobo(end[2]);
    let direction;
    if (balance !== null && balance - amount === next) direction = 'expense';
    else if (balance !== null && balance + amount === next) direction = 'income';
    else direction = next >= (balance ?? next) ? 'income' : 'expense';
    balance = next;
    const narration = joined.slice(0, end.index).replace(/\s+/g, ' ').trim();
    if (narration && amount > 0) {
      const referenceMatch = narration.match(/\b(?:ref|rrn|ft|nip)[:\s/-]*([a-z0-9-]{5,})\b/i);
      transactions.push({ date: current.date, narration, reference: referenceMatch?.[1] || '', amount, direction });
    }
    current = null;
  }
  return transactions;
}

// Moniepoint: a column-per-row PDF where pdf-parse glues the reference to the Debit/Credit/Balance
// amounts with no spaces (..._DEBIT_023,500.000.002,500.00), splits each row's timestamp across two
// lines (2026-02-24T19: / 28:12), and wraps long narrations over several lines. Every posted row ends
// in a marker like _DEBIT_0 / _CREDIT_0 / _BUSINESS_CREDIT_0 (optionally _RVSL for a reversal) carrying
// a per-split index digit, then three amounts: Debit, Credit, Balance. One of Debit/Credit is always
// 0.00, so direction comes from whichever column carries the money — which also handles reversals.
const MONEY_TOKEN = '\\d{1,3}(?:,\\d{3})*\\.\\d{2}';
const MONIEPOINT_HEADER = /DateNarrationReferenceDebitCreditBalance/;
const MONIEPOINT_DATE = /^(\d{4})-(\d{2})-(\d{2})T/;
// The index digit is non-greedy so it stays a single counter and never swallows the first amount.
const MONIEPOINT_ROW = new RegExp(
  `_(?:[A-Z]+_)*(?:DEBIT|CREDIT)_\\d+?(?:_RVSL)?(${MONEY_TOKEN})(${MONEY_TOKEN})(${MONEY_TOKEN})\\s*$`
);
// The reference is glued to the end of the narration: a pipe-delimited token or a long digit run.
const MONIEPOINT_REF = /(?:[A-Z0-9]{2,}(?:_[A-Z0-9]+)*\|\S+|\d{12,})$/;
const isMoniepoint = (text) => MONIEPOINT_HEADER.test(text);

function parseMoniepoint(text) {
  const transactions = [];
  let block = null;
  let started = false;

  const flush = () => {
    if (!block) return;
    const current = block;
    block = null;
    const joined = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    const row = joined.match(MONIEPOINT_ROW);
    if (!row) return;
    const debit = amountToKobo(row[1]);
    const credit = amountToKobo(row[2]);
    const amount = debit > 0 ? debit : credit;
    if (amount <= 0) return;
    const head = joined.slice(0, row.index).trim();
    const refMatch = head.match(MONIEPOINT_REF);
    const reference = refMatch ? refMatch[0] : '';
    // The reference is often printed twice — once on a preview line, once on the amounts line — so
    // strip trailing reference tokens repeatedly, not just once.
    let narration = head;
    let previous;
    do {
      previous = narration;
      narration = narration.replace(MONIEPOINT_REF, '').replace(/[\s/|_-]+$/, '').trim();
    } while (narration !== previous);
    // A row that is nothing but a reference still moved money, so keep it (for review) rather than drop it.
    if (!narration) narration = head;
    if (narration) {
      transactions.push({ date: current.date, narration, reference, amount, direction: debit > 0 ? 'expense' : 'income' });
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!started) {
      if (MONIEPOINT_HEADER.test(line)) started = true;
      continue;
    }
    if (!line) continue;
    const date = line.match(MONIEPOINT_DATE);
    if (date) {
      flush();
      block = { date: new Date(`${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z`), parts: [] };
      const rest = line.replace(/^\d{4}-\d{2}-\d{2}T\d{1,2}:?\s*/, '').trim();
      if (rest) block.parts.push(rest);
    } else if (block) {
      // Drop the second half of the split timestamp ("28:12", "35", "00"); keep everything else.
      if (/^\d{1,2}(?::\d{1,2})?$/.test(line)) continue;
      block.parts.push(line);
    }
  }
  flush();
  return transactions;
}

function parseStatementText(text) {
  if (isMoniepoint(text)) return parseMoniepoint(text);
  if (isZenith(text)) return parseZenith(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const transactions = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const transaction = parseTransaction(current);
    if (transaction) transactions.push(transaction);
    current = null;
  };

  for (const line of lines) {
    if (/^Posted Date.*Balance \(NGN\)$/i.test(line)) continue;
    const date = parseDate(line);
    if (date) {
      flush();
      current = { date: date.date, parts: [line.slice(date.end)] };
    } else if (current) {
      current.parts.push(line);
    }
  }
  flush();
  return transactions;
}

// Moniepoint prints the holder under a "Business Name" label; Zenith runs the name into the
// 10-digit account number in the header line.
function accountHolderOf(text) {
  const moniepoint = String(text).match(/Business Name\s*\n\s*(.+)/);
  if (moniepoint) return moniepoint[1].trim();
  const match = String(text).match(/Account Name[^\n]*\n\s*(.+?)\d{10}\d{2}\/\d{2}\/\d{4}NGN/);
  return match ? match[1].trim() : '';
}

async function extractTransactions(buffer) {
  const parsed = await pdf(buffer);
  return { transactions: parseStatementText(parsed.text), pageCount: parsed.numpages || 0, accountName: accountHolderOf(parsed.text) };
}

module.exports = { extractTransactions, parseStatementText, accountHolderOf };
