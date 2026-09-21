const pdf = require('pdf-parse');

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
// Statement amounts always include two decimal places. Requiring them prevents account
// numbers, phone numbers, and transfer references from being mistaken for money.
const MONEY = /(?:NGN|₦)?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g;
const VALUE_DATE = /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}-[A-Z]{3}-(?:\d{2}(?=[A-Z\s]|$)|\d{4}\b))/i;

const ruleFor = (narration, direction) => {
  const text = narration.toLowerCase();
  if (direction === 'income') {
    if (/pos|paystack|flutterwave|payment|settlement|hmo|inward|credit|tfr from/.test(text)) return { confidence: 'high', type: 'Income', group: 'Patient payments', item: null };
    return { confidence: 'needs-review' };
  }
  if (/salary|payroll|wages/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Staff Wages', item: null };
  if (/electric|ibedc|ikedc|ekedc|aedc|power/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity' };
  if (/airtel|mtn|glo|9mobile|data|airtime/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Data & Airtime' };
  if (/fuel|diesel/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Fuel' };
  if (/drug|pharm/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Hospital Consumables', item: 'Drugs' };
  if (/oxygen/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' };
  if (/rent/.test(text)) return { confidence: 'high', type: 'Recurrent', group: 'Rents', item: null };
  if (/commission|vat|charge|fee|stamp duty|levy/.test(text)) return { confidence: 'medium', type: 'Recurrent', group: 'Tax and Dues', item: 'Others' };
  return { confidence: 'needs-review' };
};

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
  return { date, narration: cleanNarration, reference: referenceMatch?.[1] || '', amount, direction, ...ruleFor(cleanNarration, direction) };
}

function parseStatementText(text) {
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

async function extractTransactions(buffer) {
  const parsed = await pdf(buffer);
  return { transactions: parseStatementText(parsed.text), pageCount: parsed.numpages || 0 };
}

module.exports = { extractTransactions, parseStatementText };
