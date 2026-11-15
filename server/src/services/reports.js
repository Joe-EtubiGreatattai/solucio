const mongoose = require('mongoose');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const { getTree } = require('./categories');
const { parseLagosDate, dayAfter } = require('../utils/dates');

// An optional accountId scopes a report to one bank/account; omitted, it aggregates every account.
const withAccount = (match, accountId) => (accountId ? { ...match, account: new mongoose.Types.ObjectId(accountId) } : match);

const rangeMatch = (from, to, accountId) => withAccount({
  voided: false,
  date: { $gte: parseLagosDate(from), $lt: dayAfter(parseLagosDate(to)) },
}, accountId);

// Profit-and-loss view: real income and spending only. Internal transfers between Solucio's own accounts
// still move cash (so they stay in account balances), but they are not income or spending, so every
// income/expense total and category breakdown leaves them out.
const pnlMatch = (from, to, accountId) => ({ ...rangeMatch(from, to, accountId), internalTransfer: { $ne: true } });
const transferMatch = (from, to, accountId) => ({ ...rangeMatch(from, to, accountId), internalTransfer: true });

async function totalFor(Model, match) {
  const [r] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  return { total: r ? r.total : 0, count: r ? r.count : 0 };
}

async function summary(from, to, accountId) {
  const pnl = pnlMatch(from, to, accountId);
  const transfers = transferMatch(from, to, accountId);
  const [income, spending, transferIn, transferOut] = await Promise.all([
    totalFor(Income, pnl), totalFor(Expense, pnl), totalFor(Income, transfers), totalFor(Expense, transfers),
  ]);
  return { from, to, income, spending, net: income.total - spending.total, transfers: { in: transferIn.total, out: transferOut.total } };
}

async function spendingByCategory(from, to, accountId) {
  const rows = await Expense.aggregate([
    { $match: pnlMatch(from, to, accountId) },
    { $group: { _id: { type: '$type', group: '$group', item: '$item' }, total: { $sum: '$amount' } } },
  ]);
  const totals = new Map(rows.map((r) => [`${r._id.type}|${r._id.group || ''}|${r._id.item || ''}`, r.total]));
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const pct = (n) => (grandTotal ? Math.round((n / grandTotal) * 1000) / 10 : 0);

  const types = [];
  for (const { type, groups } of await getTree({ includeInactive: true })) {
    const groupOut = [];
    for (const g of groups) {
      const untagged = totals.get(`${type}|${g.name}|`) || 0;
      const items = g.items
        .map(({ name: item }) => ({ item, total: totals.get(`${type}|${g.name}|${item}`) || 0 }))
        .filter((i) => i.total > 0);
      // Money recorded before the group had items has no item; keep it visible rather than dropping it.
      if (g.items.length > 0 && untagged > 0) items.push({ item: 'No item', total: untagged });
      const groupTotal = items.reduce((s, i) => s + i.total, 0) + (g.items.length === 0 ? untagged : 0);
      if (groupTotal > 0) {
        groupOut.push({ group: g.name, total: groupTotal, percent: pct(groupTotal), items: items.map((i) => ({ ...i, percent: pct(i.total) })) });
      }
    }
    // Money recorded against the type with no group of its own stays visible under "No group".
    const noGroup = totals.get(`${type}||`) || 0;
    if (noGroup > 0) groupOut.push({ group: 'No group', total: noGroup, percent: pct(noGroup), items: [] });
    const typeTotal = groupOut.reduce((s, g) => s + g.total, 0);
    if (typeTotal > 0) types.push({ type, total: typeTotal, percent: pct(typeTotal), groups: groupOut });
  }
  return { grandTotal, types };
}

// Income grouped under the income category tree, with everything uncategorized kept in its own bucket.
async function incomeByCategory(from, to, accountId) {
  const rows = await Income.aggregate([
    { $match: pnlMatch(from, to, accountId) },
    { $group: { _id: { type: '$type', group: '$group', item: '$item' }, total: { $sum: '$amount' } } },
  ]);
  const uncategorized = rows.filter((r) => !r._id.type).reduce((s, r) => s + r.total, 0);
  const totals = new Map(rows.filter((r) => r._id.type).map((r) => [`${r._id.type}|${r._id.group || ''}|${r._id.item || ''}`, r.total]));
  const grandTotal = [...totals.values()].reduce((s, n) => s + n, 0);
  const pct = (n) => (grandTotal ? Math.round((n / grandTotal) * 1000) / 10 : 0);

  const types = [];
  for (const { type, groups } of await getTree({ kind: 'income', includeInactive: true })) {
    const groupOut = [];
    for (const g of groups) {
      const untagged = totals.get(`${type}|${g.name}|`) || 0;
      const items = g.items
        .map(({ name: item }) => ({ item, total: totals.get(`${type}|${g.name}|${item}`) || 0 }))
        .filter((i) => i.total > 0);
      if (g.items.length > 0 && untagged > 0) items.push({ item: 'No item', total: untagged });
      const groupTotal = items.reduce((s, i) => s + i.total, 0) + (g.items.length === 0 ? untagged : 0);
      if (groupTotal > 0) {
        groupOut.push({ group: g.name, total: groupTotal, percent: pct(groupTotal), items: items.map((i) => ({ ...i, percent: pct(i.total) })) });
      }
    }
    // Income recorded against the type with no group of its own stays visible under "No group".
    const noGroup = totals.get(`${type}||`) || 0;
    if (noGroup > 0) groupOut.push({ group: 'No group', total: noGroup, percent: pct(noGroup), items: [] });
    const typeTotal = groupOut.reduce((s, g) => s + g.total, 0);
    if (typeTotal > 0) types.push({ type, total: typeTotal, percent: pct(typeTotal), groups: groupOut });
  }
  return { grandTotal, uncategorized, types };
}

async function accountBalances(asOf, accountId) {
  const match = { voided: false };
  if (asOf) match.date = { $lt: dayAfter(parseLagosDate(asOf)) };
  const withAcct = withAccount(match, accountId);
  const byAccount = async (Model) => {
    const rows = await Model.aggregate([{ $match: withAcct }, { $group: { _id: '$account', total: { $sum: '$amount' } } }]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  };
  const accountFilter = accountId ? { _id: accountId } : {};
  const [inMap, outMap, accounts] = await Promise.all([byAccount(Income), byAccount(Expense), Account.find(accountFilter).sort('name')]);
  const rows = accounts.map((a) => {
    const totalIn = inMap.get(String(a._id)) || 0;
    const totalOut = outMap.get(String(a._id)) || 0;
    return {
      accountId: a._id, name: a.name, type: a.type, bankName: a.bankName, accountNumber: a.accountNumber, active: a.active,
      openingBalance: a.openingBalance, totalIn, totalOut, balance: a.openingBalance + totalIn - totalOut,
    };
  });
  return { accounts: rows, grandTotal: rows.reduce((s, r) => s + r.balance, 0) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // matches utils/dates.js: UTC+1, no DST

// The ISO (yyyy-mm-dd) Lagos-calendar-day for a Date that already sits at Lagos midnight,
// i.e. the inverse of parseLagosDate.
const isoOf = (d) => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (isoStr, n) => isoOf(new Date(parseLagosDate(isoStr).getTime() + n * DAY_MS));

function listDays(from, to) {
  const days = [];
  for (let d = parseLagosDate(from); d <= parseLagosDate(to); d = dayAfter(d)) days.push(isoOf(d));
  return days;
}

// Per-Lagos-day totals for a model, as a Map of 'yyyy-mm-dd' -> kobo.
async function dailyTotals(Model, match) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: '+01:00' } }, total: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.total]));
}

function bucketFor(numDays) {
  if (numDays <= 31) return 'day';
  if (numDays <= 182) return 'week';
  return 'month';
}

// Groups a day-by-day series into week (7-day, counted from the first day) or month (calendar) buckets.
function rebucket(days, bucket) {
  if (bucket === 'day') return days.map((d) => ({ date: d.date, income: d.income, expenses: d.expenses, transferNet: d.transferNet || 0 }));
  const key = bucket === 'week' ? (d, i) => days[Math.floor(i / 7) * 7].date : (d) => d.date.slice(0, 7);
  const byBucket = new Map();
  days.forEach((d, i) => {
    const k = key(d, i);
    const row = byBucket.get(k) || { date: k, income: 0, expenses: 0, transferNet: 0 };
    row.income += d.income;
    row.expenses += d.expenses;
    row.transferNet += d.transferNet || 0;
    byBucket.set(k, row);
  });
  return [...byBucket.values()];
}

const changePct = (curr, prev) => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
};

// A fuller picture for the Reports page: a trend series with a running cash balance, this period
// against the one before it, a simple burn-rate/runway estimate, and the biggest drivers of the numbers.
async function cashFlow(from, to, accountId, precomputed = {}) {
  const pnl = pnlMatch(from, to, accountId);
  const transfers = transferMatch(from, to, accountId);
  const [income, expenses, transferIn, transferOut, incomeByDay, expenseByDay, transferInByDay, transferOutByDay] = await Promise.all([
    totalFor(Income, pnl),
    totalFor(Expense, pnl),
    totalFor(Income, transfers),
    totalFor(Expense, transfers),
    dailyTotals(Income, pnl),
    dailyTotals(Expense, pnl),
    dailyTotals(Income, transfers),
    dailyTotals(Expense, transfers),
  ]);
  const days = listDays(from, to).map((date) => ({
    date, income: incomeByDay.get(date) || 0, expenses: expenseByDay.get(date) || 0,
    transferNet: (transferInByDay.get(date) || 0) - (transferOutByDay.get(date) || 0),
  }));
  const numDays = days.length;
  const bucket = bucketFor(numDays);

  const dayBeforeFrom = addDays(from, -1);
  const startingCash = (await accountBalances(dayBeforeFrom, accountId)).grandTotal;
  let cumulative = startingCash;
  // Bars show real income and spending; the running balance line also moves with internal transfers,
  // so it stays a true cash balance that ties to account balances.
  const series = rebucket(days, bucket).map((row) => {
    const net = row.income - row.expenses;
    cumulative += net + row.transferNet;
    return { date: row.date, income: row.income, expenses: row.expenses, net, cumulative };
  });

  const prevTo = dayBeforeFrom;
  const prevFrom = addDays(prevTo, -(numDays - 1));
  const prevMatch = pnlMatch(prevFrom, prevTo, accountId);
  const [prevIncome, prevExpenses] = await Promise.all([totalFor(Income, prevMatch), totalFor(Expense, prevMatch)]);
  const net = income.total - expenses.total;
  const prevNet = prevIncome.total - prevExpenses.total;
  const transferNetTotal = transferIn.total - transferOut.total;

  // Cash on hand at the end of the range is the opening balance plus this period's real net and the net
  // of internal transfers (which move money between accounts). The opening-balance scan already counted
  // transfers up to the start, so balances stay correct per account and net to zero across all accounts.
  const cashOnHand = startingCash + net + transferNetTotal;
  const avgDailyNet = Math.round(net / numDays);
  const runwayDays = avgDailyNet < 0 ? (cashOnHand > 0 ? Math.floor(cashOnHand / Math.abs(avgDailyNet)) : 0) : null;

  // The combined overview computes spending-by-category once and hands it in, so cash flow doesn't
  // repeat that aggregation. Standalone callers still get it computed here.
  const byCategory = (await precomputed.spending) || await spendingByCategory(from, to, accountId);
  const topOutflows = byCategory.types
    .flatMap((t) => t.groups.map((g) => ({ type: t.type, group: g.group, total: g.total, percent: g.percent })))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const methodRows = await Income.aggregate([{ $match: pnl }, { $group: { _id: '$method', total: { $sum: '$amount' } } }]);
  const incomeByMethod = methodRows
    .map((r) => ({ method: r._id, total: r.total, percent: income.total ? Math.round((r.total / income.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    range: { from, to },
    bucket,
    series,
    totals: { income: income.total, expenses: expenses.total, net, cashOnHand, transfersIn: transferIn.total, transfersOut: transferOut.total },
    previous: { income: prevIncome.total, expenses: prevExpenses.total, net: prevNet },
    change: { income: changePct(income.total, prevIncome.total), expenses: changePct(expenses.total, prevExpenses.total), net: changePct(net, prevNet) },
    burnRate: { avgDailyNet, runwayDays },
    topOutflows,
    incomeByMethod,
  };
}

// Everything the Reports page needs in one request. Spending-by-category is computed once and shared
// with cash flow (which needs it for top outflows), so the page costs one round-trip and the server
// runs the heavy spending aggregation a single time instead of twice.
async function overview(from, to, accountId) {
  const spending = spendingByCategory(from, to, accountId);
  const [spendingResult, income, cash] = await Promise.all([
    spending,
    incomeByCategory(from, to, accountId),
    cashFlow(from, to, accountId, { spending }),
  ]);
  return { spending: spendingResult, income, cashFlow: cash };
}

module.exports = { summary, spendingByCategory, incomeByCategory, accountBalances, cashFlow, overview };
