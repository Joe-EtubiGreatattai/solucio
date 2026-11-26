const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Statement = require('../models/Statement');
const StatementSource = require('../models/StatementSource');
const Category = require('../models/Category');
const Account = require('../models/Account');
const Counter = require('../models/Counter');
const { Slate, SlateArchive } = require('../models/Slate');

const sumAmount = async (Model) => {
  const [r] = await Model.aggregate([
    { $match: { voided: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return { total: r ? r.total : 0, count: r ? r.count : 0 };
};

// Each account's closing position: opening balance plus income minus expenses (non-voided).
async function accountClosings() {
  const [accounts, inc, exp] = await Promise.all([
    Account.find({}).lean(),
    Income.aggregate([{ $match: { voided: { $ne: true } } }, { $group: { _id: '$account', total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { voided: { $ne: true } } }, { $group: { _id: '$account', total: { $sum: '$amount' } } }]),
  ]);
  const incMap = new Map(inc.map((x) => [String(x._id), x.total]));
  const expMap = new Map(exp.map((x) => [String(x._id), x.total]));
  return accounts.map((a) => ({
    name: a.name,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    closingKobo: (a.openingBalance || 0) + (incMap.get(String(a._id)) || 0) - (expMap.get(String(a._id)) || 0),
  }));
}

// Copy every document of a collection into the slate's archive, in batches so memory stays flat.
async function archiveCollection(slateId, kind, Model, batch = 300) {
  const cursor = Model.find({}).lean().cursor();
  let buffer = [];
  let total = 0;
  const flush = async () => { if (buffer.length) { await SlateArchive.insertMany(buffer, { ordered: false }); total += buffer.length; buffer = []; } };
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    buffer.push({ slate: slateId, kind, data: doc });
    if (buffer.length >= batch) await flush();
  }
  await flush();
  return total;
}

/**
 * Close the current year into a slate, then clear the system for the next one. The archive is written
 * FIRST and in full, so nothing is lost even if the clear is interrupted. Returns the Slate.
 *
 * Cleared: income, expenses, statements and their raw PDFs, categories; receipt counters reset; every
 * account's opening balance set to 0. Kept: accounts, users and roles.
 */
async function performNewSlate({ label, by }) {
  const [income, expense, statementCount, categoryCount, accounts] = await Promise.all([
    sumAmount(Income), sumAmount(Expense), Statement.countDocuments({}), Category.countDocuments({}), accountClosings(),
  ]);

  const slate = await Slate.create({
    label,
    createdBy: by,
    summary: {
      incomeKobo: income.total,
      expenseKobo: expense.total,
      netKobo: income.total - expense.total,
      incomeCount: income.count,
      expenseCount: expense.count,
      statementCount,
      categoryCount,
      accounts,
    },
  });

  // 1) Archive everything first (safety net).
  await archiveCollection(slate._id, 'income', Income);
  await archiveCollection(slate._id, 'expense', Expense);
  await archiveCollection(slate._id, 'statement', Statement);
  await archiveCollection(slate._id, 'statementSource', StatementSource);
  await archiveCollection(slate._id, 'category', Category);

  // 2) Then clear the live system for the new year.
  await Promise.all([
    Income.deleteMany({}),
    Expense.deleteMany({}),
    Statement.deleteMany({}),
    StatementSource.deleteMany({}),
    Category.deleteMany({}),
  ]);
  await Counter.deleteMany({}); // reset receipt numbers and other sequences
  await Account.updateMany({}, { $set: { openingBalance: 0 } });

  return slate;
}

module.exports = { performNewSlate, accountClosings };
