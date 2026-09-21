const { parseLagosDate, dayAfter } = require('./dates');

function dateFilter(from, to) {
  const d = {};
  if (from) d.$gte = parseLagosDate(from);
  if (to) d.$lt = dayAfter(parseLagosDate(to));
  return Object.keys(d).length ? { date: d } : {};
}
const statusFilter = (status) => (status === 'active' ? { voided: false } : status === 'voided' ? { voided: true } : {});

module.exports = { dateFilter, statusFilter };
