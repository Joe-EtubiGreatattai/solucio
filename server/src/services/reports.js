const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const { getTree } = require('./categories');
const { parseLagosDate, dayAfter } = require('../utils/dates');

const rangeMatch = (from, to) => ({
  voided: false,
  date: { $gte: parseLagosDate(from), $lt: dayAfter(parseLagosDate(to)) },
});

async function totalFor(Model, match) {
  const [r] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  return { total: r ? r.total : 0, count: r ? r.count : 0 };
}

async function summary(from, to) {
  const match = rangeMatch(from, to);
  const [income, spending] = await Promise.all([totalFor(Income, match), totalFor(Expense, match)]);
  return { from, to, income, spending, net: income.total - spending.total };
}

async function spendingByCategory(from, to) {
  const rows = await Expense.aggregate([
    { $match: rangeMatch(from, to) },
    { $group: { _id: { type: '$type', group: '$group', item: '$item' }, total: { $sum: '$amount' } } },
  ]);
  const totals = new Map(rows.map((r) => [`${r._id.type}|${r._id.group}|${r._id.item || ''}`, r.total]));
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
    const typeTotal = groupOut.reduce((s, g) => s + g.total, 0);
    if (typeTotal > 0) types.push({ type, total: typeTotal, percent: pct(typeTotal), groups: groupOut });
  }
  return { grandTotal, types };
}

async function accountBalances(asOf) {
  const match = { voided: false };
  if (asOf) match.date = { $lt: dayAfter(parseLagosDate(asOf)) };
  const byAccount = async (Model) => {
    const rows = await Model.aggregate([{ $match: match }, { $group: { _id: '$account', total: { $sum: '$amount' } } }]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  };
  const [inMap, outMap, accounts] = await Promise.all([byAccount(Income), byAccount(Expense), Account.find().sort('name')]);
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
  if (bucket === 'day') return days.map((d) => ({ date: d.date, income: d.income, expenses: d.expenses }));
  const key = bucket === 'week' ? (d, i) => days[Math.floor(i / 7) * 7].date : (d) => d.date.slice(0, 7);
  const byBucket = new Map();
  days.forEach((d, i) => {
    const k = key(d, i);
    const row = byBucket.get(k) || { date: k, income: 0, expenses: 0 };
    row.income += d.income;
    row.expenses += d.expenses;
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
async function cashFlow(from, to) {
  const match = rangeMatch(from, to);
  const [income, expenses, incomeByDay, expenseByDay] = await Promise.all([
    totalFor(Income, match),
    totalFor(Expense, match),
    dailyTotals(Income, match),
    dailyTotals(Expense, match),
  ]);
  const days = listDays(from, to).map((date) => ({ date, income: incomeByDay.get(date) || 0, expenses: expenseByDay.get(date) || 0 }));
  const numDays = days.length;
  const bucket = bucketFor(numDays);

  const dayBeforeFrom = addDays(from, -1);
  const startingCash = (await accountBalances(dayBeforeFrom)).grandTotal;
  let cumulative = startingCash;
  const series = rebucket(days, bucket).map((row) => {
    const net = row.income - row.expenses;
    cumulative += net;
    return { ...row, net, cumulative };
  });

  const prevTo = dayBeforeFrom;
  const prevFrom = addDays(prevTo, -(numDays - 1));
  const prevMatch = rangeMatch(prevFrom, prevTo);
  const [prevIncome, prevExpenses] = await Promise.all([totalFor(Income, prevMatch), totalFor(Expense, prevMatch)]);
  const net = income.total - expenses.total;
  const prevNet = prevIncome.total - prevExpenses.total;

  const cashOnHand = (await accountBalances(to)).grandTotal;
  const avgDailyNet = Math.round(net / numDays);
  const runwayDays = avgDailyNet < 0 ? (cashOnHand > 0 ? Math.floor(cashOnHand / Math.abs(avgDailyNet)) : 0) : null;

  const byCategory = await spendingByCategory(from, to);
  const topOutflows = byCategory.types
    .flatMap((t) => t.groups.map((g) => ({ type: t.type, group: g.group, total: g.total, percent: g.percent })))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const methodRows = await Income.aggregate([{ $match: match }, { $group: { _id: '$method', total: { $sum: '$amount' } } }]);
  const incomeByMethod = methodRows
    .map((r) => ({ method: r._id, total: r.total, percent: income.total ? Math.round((r.total / income.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    range: { from, to },
    bucket,
    series,
    totals: { income: income.total, expenses: expenses.total, net, cashOnHand },
    previous: { income: prevIncome.total, expenses: prevExpenses.total, net: prevNet },
    change: { income: changePct(income.total, prevIncome.total), expenses: changePct(expenses.total, prevExpenses.total), net: changePct(net, prevNet) },
    burnRate: { avgDailyNet, runwayDays },
    topOutflows,
    incomeByMethod,
  };
}

module.exports = { summary, spendingByCategory, accountBalances, cashFlow };
