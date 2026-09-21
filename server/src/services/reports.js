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

module.exports = { summary, spendingByCategory, accountBalances };
