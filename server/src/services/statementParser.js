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

function parseStatementText(text) {
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

// Zenith headers carry the account holder's name, run into the 10-digit account number.
function accountHolderOf(text) {
  const match = String(text).match(/Account Name[^\n]*\n\s*(.+?)\d{10}\d{2}\/\d{2}\/\d{4}NGN/);
  return match ? match[1].trim() : '';
}

async function extractTransactions(buffer) {
  const parsed = await pdf(buffer);
  return { transactions: parseStatementText(parsed.text), pageCount: parsed.numpages || 0, accountName: accountHolderOf(parsed.text) };
}

module.exports = { extractTransactions, parseStatementText, accountHolderOf };
