const Income = require('../models/Income');
const Expense = require('../models/Expense');
const reports = require('./reports');
const { dateFilter } = require('../utils/filters');
const { formatLagosDate } = require('../utils/dates');

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };
const populate = [['account', 'name type bankName accountNumber'], ['recordedBy', 'name']];
const withPopulate = (q) => populate.reduce((acc, [p, s]) => acc.populate(p, s), q);

const accountLabel = (a) =>
  !a ? '' : a.type === 'bank' ? `${a.name} (${a.bankName} ****${String(a.accountNumber).slice(-4)})` : a.name;
const statusOf = (r) => (r.voided ? `VOID: ${r.voidReason}` : 'Active');
const sumActive = (items) => items.filter((i) => !i.voided).reduce((s, i) => s + i.amount, 0);

async function incomeTable(from, to) {
  const items = await withPopulate(Income.find(dateFilter(from, to)).sort({ date: 1, createdAt: 1 }));
  return {
    title: 'Income',
    subtitle: `${from} to ${to}`,
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Receipt No.', key: 'receiptNumber', width: 16 },
      { header: 'Method', key: 'method', width: 14 },
      { header: 'Account', key: 'account', width: 34 },
      { header: 'Amount (NGN)', key: 'amount', width: 16, type: 'money' },
      { header: 'Status', key: 'status', width: 26 },
      { header: 'Recorded by', key: 'recordedBy', width: 18 },
    ],
    rows: items.map((i) => ({
      date: formatLagosDate(i.date), receiptNumber: i.receiptNumber, method: METHOD[i.method], account: accountLabel(i.account),
      amount: i.amount, status: statusOf(i), recordedBy: i.recordedBy ? i.recordedBy.name : '', voided: i.voided,
    })),
    totals: { label: 'Total (excluding void)', amount: sumActive(items) },
  };
}

async function expenseTable(from, to) {
  const items = await withPopulate(Expense.find(dateFilter(from, to)).sort({ date: 1, createdAt: 1 }));
  return {
    title: 'Expenses',
    subtitle: `${from} to ${to}`,
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Category', key: 'category', width: 44 },
      { header: 'Account', key: 'account', width: 34 },
      { header: 'Amount (NGN)', key: 'amount', width: 16, type: 'money' },
      { header: 'Status', key: 'status', width: 26 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Recorded by', key: 'recordedBy', width: 18 },
    ],
    rows: items.map((e) => ({
      date: formatLagosDate(e.date), category: [e.type, e.group, e.item].filter(Boolean).join(' > '), account: accountLabel(e.account),
      amount: e.amount, status: statusOf(e), note: e.note || '', recordedBy: e.recordedBy ? e.recordedBy.name : '', voided: e.voided,
    })),
    totals: { label: 'Total (excluding void)', amount: sumActive(items) },
  };
}

async function summaryTable(from, to) {
  const [s, c] = await Promise.all([reports.summary(from, to), reports.spendingByCategory(from, to)]);
  const rows = [
    { label: 'Total income', amount: s.income.total },
    { label: 'Total spending', amount: s.spending.total },
    { label: 'Net', amount: s.net },
    { label: '', amount: null },
    { label: 'Spending by category', amount: null },
  ];
  for (const t of c.types) {
    rows.push({ label: t.type, amount: t.total });
    for (const g of t.groups) {
      rows.push({ label: `   ${g.group}`, amount: g.total });
      for (const i of g.items) rows.push({ label: `      ${i.item}`, amount: i.total });
    }
  }
  return {
    title: 'Summary',
    subtitle: `${from} to ${to}`,
    columns: [{ header: 'Item', key: 'label', width: 44 }, { header: 'Amount (NGN)', key: 'amount', width: 18, type: 'money' }],
    rows,
    totals: null,
  };
}

const buildTable = (type, from, to) => ({ income: incomeTable, expenses: expenseTable, summary: summaryTable })[type](from, to);

module.exports = { buildTable };
