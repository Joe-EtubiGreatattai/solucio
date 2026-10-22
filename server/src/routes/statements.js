const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const Statement = require('../models/Statement');
const StatementSource = require('../models/StatementSource');
const Account = require('../models/Account');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { objectId } = require('../utils/schemas');
const { extractTransactions } = require('../services/statementParser');
const { categorizeTransactions, loadCategorizerContext, payeeOf, isBankCharge } = require('../services/statementCategorizer');
const { logAudit, logAuditBatch } = require('../services/audit');
const { reserveReceipts } = require('../services/receiptNumber');
const { classifyAgainstTree, getTree, assertValidCategory } = require('../services/categories');

const router = express.Router();
const listQuery = z.object({
  accountId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});
const updateBody = z.object({
  type: z.string().trim().max(60).nullable().optional(),
  group: z.string().trim().max(60).nullable().optional(),
  item: z.string().trim().max(60).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'needs-review']).optional(),
  // Lets a reviewer correct the parser's income/expense guess before approving.
  direction: z.enum(['income', 'expense']).optional(),
  // Whether this row should be imported at all when the statement is approved.
  included: z.boolean().optional(),
});
const includeBody = z.object({ scope: z.enum(['all', 'income', 'expense']) });

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // matches utils/dates.js: UTC+1, no DST
const lagosYear = (date) => new Date(date.getTime() + LAGOS_OFFSET_MS).getUTCFullYear();

router.use(authenticate);

const present = (statement) => statement.toObject ? statement.toObject() : statement;
const REFS = [{ path: 'account', select: 'name bankName accountNumber' }, { path: 'uploadedBy', select: 'name' }, { path: 'approvedBy', select: 'name' }];
// Populate the already-loaded (and just-saved) document instead of reading the whole statement back from
// the database a second time just to return it.
const presentPopulated = (statement) => statement.populate(REFS).then(present);

// A person has already decided this row, so automatic categorization must leave it alone.
const decidedByPerson = (t) => t.categorySource === 'reviewer' || (!t.categorySource && !!t.reviewedAt);
const suggestion = (r) => ({ type: r.type, group: r.group, item: r.item, confidence: r.confidence, reason: r.reason, categorySource: r.categorySource });

// The library only needs each statement's identity and two counts. Pulling only the two transaction
// subfields the counts need — instead of every row's narration, amount, reason, etc. — keeps this list
// small and fast even with a year of statements on file.
const summarize = (statement) => {
  const obj = present(statement);
  const transactions = obj.transactions || [];
  const transactionCount = transactions.length;
  const unresolvedCount = transactions.filter((t) => t.included !== false && t.confidence === 'needs-review').length;
  delete obj.transactions;
  return { ...obj, transactionCount, unresolvedCount };
};

router.get('/', requirePermission('statements.view'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { accountId, page, limit } = req.validated.query;
  const filter = accountId ? { account: accountId } : {};
  const [items, total] = await Promise.all([
    Statement.find(filter)
      .select('account fileName holderName status uploadedBy approvedBy approvedAt createdAt transactions.included transactions.confidence')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('account', 'name bankName accountNumber')
      .populate('uploadedBy', 'name')
      .populate('approvedBy', 'name'),
    Statement.countDocuments(filter),
  ]);
  res.json({ items: items.map(summarize), total, page, limit });
}));

router.get('/:id', requirePermission('statements.view'), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id).populate(REFS);
  if (!statement) throw new AppError(404, 'Statement not found');
  res.json(present(statement));
}));

router.post('/import', requirePermission('statements.import'), express.raw({ type: 'application/pdf', limit: '10mb' }), asyncHandler(async (req, res) => {
  const accountId = String(req.query.accountId || '');
  const fileName = String(req.query.fileName || 'statement.pdf').slice(0, 160);
  if (!objectId.safeParse(accountId).success) throw new AppError(400, 'Choose a bank account', { accountId: 'Choose a bank account' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new AppError(400, 'Choose a PDF statement', { file: 'Choose a PDF statement' });
  const account = await Account.findById(accountId);
  if (!account || !account.active || account.type !== 'bank') throw new AppError(400, 'Choose an active bank account', { accountId: 'Choose an active bank account' });

  let result;
  try {
    result = await extractTransactions(req.body);
  } catch {
    throw new AppError(422, 'We could not read this PDF. Upload a text-based bank statement or review a clearer export.');
  }
  if (result.transactions.length === 0) throw new AppError(422, 'No transaction rows were found. This statement may be scanned or use an unsupported layout.');

  const holderName = result.accountName || account.name;
  const results = categorizeTransactions(result.transactions, { ...(await loadCategorizerContext()), ownerName: holderName });
  const transactions = result.transactions.map((transaction, i) => ({ ...transaction, ...results[i] }));
  const statement = await Statement.create({ account: account._id, fileName, holderName, uploadedBy: req.user._id, transactions });
  // The raw PDF is kept out of the statement document (see StatementSource) so the statement stays small.
  await StatementSource.create({ statement: statement._id, mimeType: 'application/pdf', data: req.body });
  await logAudit({ actor: req.user._id, action: 'statement.import', targetModel: 'Statement', targetId: statement._id, details: { fileName, account: account.name, transactions: result.transactions.length, pages: result.pageCount, checksum: crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 12) } });
  res.status(201).json(await presentPopulated(statement));
}));

router.patch('/:id/transactions/:transactionId', requirePermission('statements.review'), validate(updateBody), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id);
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') throw new AppError(409, 'Approved statements cannot be changed');
  const transaction = statement.transactions.id(req.params.transactionId);
  if (!transaction) throw new AppError(404, 'Transaction not found');
  const body = req.validated.body;
  Object.assign(transaction, body, { reviewedBy: req.user._id, reviewedAt: new Date() });
  // Changing a row's direction drops any category from the other ledger, which no longer applies.
  if ('direction' in body && !('type' in body)) {
    transaction.type = null;
    transaction.group = null;
    transaction.item = null;
  }
  // A category can be set at any depth from the top, but never a deeper level without its parents
  // (no item without a group, no group without a type) — otherwise a row would be left half-categorized.
  if (['type', 'group', 'item', 'direction'].some((key) => key in body)) {
    const kind = transaction.direction === 'income' ? 'income' : 'expense';
    await assertValidCategory(transaction.type || undefined, transaction.group || undefined, transaction.item || undefined, kind);
  }
  if (['type', 'group', 'item', 'direction', 'confidence'].some((key) => key in body)) {
    transaction.categorySource = 'reviewer';
    transaction.reason = `Chosen by ${req.user.name}`;
  }

  // Confirming a category teaches every other row to the same payee that nobody has decided yet.
  let similarUpdated = 0;
  const confirmed = body.confidence === 'high' && transaction.type && transaction.group;
  const { key } = payeeOf(transaction.narration);
  if (confirmed && key && !isBankCharge(transaction.narration)) {
    for (const other of statement.transactions) {
      if (other._id.equals(transaction._id) || other.direction !== transaction.direction || decidedByPerson(other) || isBankCharge(other.narration)) continue;
      if (payeeOf(other.narration).key !== key) continue;
      const already = other.type === transaction.type && other.group === transaction.group
        && (other.item || null) === (transaction.item || null) && other.confidence === 'high';
      if (already) continue;
      Object.assign(other, {
        type: transaction.type, group: transaction.group, item: transaction.item || null,
        confidence: 'high', categorySource: 'similar', reason: 'Same payee as a transaction you reviewed',
      });
      similarUpdated += 1;
    }
  }
  await statement.save();
  await logAudit({ actor: req.user._id, action: 'statement.review', targetModel: 'Statement', targetId: statement._id, details: { fileName: statement.fileName, transaction: transaction.narration, category: [transaction.type, transaction.group, transaction.item].filter(Boolean).join(' › '), similarUpdated } });
  res.json({ ...(await presentPopulated(statement)), similarUpdated });
}));

// One click to keep only the income rows, only the expense rows, or bring everything back.
router.patch('/:id/include', requirePermission('statements.review'), validate(includeBody), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id);
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') throw new AppError(409, 'Approved statements cannot be changed');
  const { scope } = req.validated.body;
  let changed = 0;
  for (const transaction of statement.transactions) {
    const next = scope === 'all' ? true : transaction.direction === scope;
    if (transaction.included !== next) { transaction.included = next; changed += 1; }
  }
  await statement.save();
  await logAudit({ actor: req.user._id, action: 'statement.bulk-include', targetModel: 'Statement', targetId: statement._id, details: { fileName: statement.fileName, scope, changed } });
  res.json(await presentPopulated(statement));
}));

// Re-run categorization on rows nobody has decided yet, using the current category tree and everything
// reviewers have taught it since the statement was imported.
router.post('/:id/recategorize', requirePermission('statements.review'), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id);
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') throw new AppError(409, 'Approved statements cannot be changed');
  const account = await Account.findById(statement.account).lean();
  const targets = statement.transactions.filter((transaction) => !decidedByPerson(transaction));
  const results = categorizeTransactions(targets, { ...(await loadCategorizerContext()), ownerName: statement.holderName || account?.name });

  let changed = 0;
  targets.forEach((transaction, i) => {
    const next = suggestion(results[i]);
    if (results[i].included === false) next.included = false;
    const differs = ['type', 'group', 'item', 'confidence'].some((key) => (transaction[key] || null) !== (next[key] || null)) || (next.included === false && transaction.included !== false);
    if (differs) changed += 1;
    Object.assign(transaction, next);
  });
  await statement.save();
  const needReview = statement.transactions.filter((transaction) => transaction.included !== false && transaction.confidence === 'needs-review').length;
  const recategorized = { checked: targets.length, changed, needReview };
  await logAudit({ actor: req.user._id, action: 'statement.recategorize', targetModel: 'Statement', targetId: statement._id, details: { fileName: statement.fileName, ...recategorized } });
  res.json({ ...(await presentPopulated(statement)), recategorized });
}));

// Discard a statement that is still in review (a wrong file, a duplicate upload). Approved statements stay:
// their rows are already income and expense records, which are corrected by voiding, never by deleting.
router.delete('/:id', requirePermission('statements.approve'), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id).populate('account', 'name');
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') {
    throw new AppError(409, 'Approved statements cannot be deleted because their transactions are already in your records. Void those records instead.');
  }
  await statement.deleteOne();
  await StatementSource.deleteOne({ statement: statement._id });
  await logAudit({
    actor: req.user._id, action: 'statement.delete', targetModel: 'Statement', targetId: statement._id,
    details: { fileName: statement.fileName, account: statement.account?.name, transactions: statement.transactions.length },
  });
  res.json({ deleted: true });
}));

router.post('/:id/approve', requirePermission('statements.approve'), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id);
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') throw new AppError(409, 'This statement is already approved');

  // Excluded rows are left out entirely: they don't need review and they never become records.
  const included = statement.transactions.filter((transaction) => transaction.included !== false);
  if (included.length === 0) throw new AppError(400, 'Choose at least one transaction to import');
  const unresolved = included.filter((transaction) => transaction.confidence === 'needs-review');
  if (unresolved.length) throw new AppError(409, `${unresolved.length} transaction${unresolved.length === 1 ? '' : 's'} still need review`);

  // Check every included expense against the current category tree before posting anything,
  // so a half-imported statement can never happen.
  const [expenseTree, incomeTree] = await Promise.all([
    getTree({ kind: 'expense', includeInactive: true }),
    getTree({ kind: 'income', includeInactive: true }),
  ]);
  const blockers = [];
  for (const transaction of included) {
    const ledger = transaction.direction === 'income' ? 'income' : 'expense';
    const addBlocker = (action, create) => blockers.push({
      transactionId: String(transaction._id), narration: transaction.narration, kind: ledger,
      path: [transaction.type, transaction.group, transaction.item].filter(Boolean).join(' › '),
      action, ...(create && { create }),
    });
    if (!transaction.type) {
      // Income may be left uncategorized, but an expense needs at least a type (the Expense model
      // requires one), so flag it instead of crashing mid-import.
      if (ledger === 'expense') addBlocker('choose');
      continue;
    }
    const issue = classifyAgainstTree(ledger === 'income' ? incomeTree : expenseTree, transaction.type, transaction.group, transaction.item);
    if (issue) addBlocker(issue.action, issue.create);
  }
  if (blockers.length) {
    const n = blockers.length;
    throw new AppError(409, `${n} transaction${n === 1 ? '' : 's'} use a category that isn't fully set up. Create the missing categories, or choose one on each, then approve.`, undefined, { blockers });
  }

  const account = await Account.findById(statement.account);
  if (!account || !account.active) throw new AppError(400, 'The account for this statement is no longer active.');

  // Post every included row in a few batched writes rather than thousands of sequential ones. A statement
  // can carry thousands of transactions; creating each record, its receipt number and its audit entry one
  // at a time ran for over a minute and the gateway timed out (504). We reserve receipt numbers a year's
  // worth at a time, bulk-insert the income and expense records, then write their audit entries in one go.
  const incomeTx = included.filter((transaction) => transaction.direction === 'income');
  const expenseTx = included.filter((transaction) => transaction.direction !== 'income');

  // Reserve a block of receipt numbers for each year the income rows fall in (usually just one), then
  // hand them out in order.
  const countByYear = new Map();
  for (const transaction of incomeTx) {
    const year = String(lagosYear(transaction.date));
    countByYear.set(year, (countByYear.get(year) || 0) + 1);
  }
  const receiptsByYear = new Map();
  for (const [year, count] of countByYear) {
    receiptsByYear.set(year, { numbers: await reserveReceipts(year, count), next: 0 });
  }

  const incomeDocs = incomeTx.map((transaction) => {
    const slot = receiptsByYear.get(String(lagosYear(transaction.date)));
    const receiptNumber = slot.numbers[slot.next];
    slot.next += 1;
    return {
      amount: transaction.amount, date: transaction.date, method: 'transfer', account: account._id,
      receiptNumber, recordedBy: req.user._id,
      type: transaction.type || null, group: transaction.group || null, item: transaction.item || null,
    };
  });
  const expenseDocs = expenseTx.map((transaction) => ({
    amount: transaction.amount, date: transaction.date, account: account._id,
    type: transaction.type, group: transaction.group, item: transaction.item || null,
    note: `Imported from ${statement.fileName}`, recordedBy: req.user._id,
  }));

  const [createdIncome, createdExpense] = await Promise.all([
    incomeDocs.length ? Income.insertMany(incomeDocs) : [],
    expenseDocs.length ? Expense.insertMany(expenseDocs) : [],
  ]);

  // insertMany preserves order, so each created record lines up with the transaction that produced it.
  incomeTx.forEach((transaction, i) => { transaction.postedModel = 'Income'; transaction.postedId = createdIncome[i]._id; });
  expenseTx.forEach((transaction, i) => { transaction.postedModel = 'Expense'; transaction.postedId = createdExpense[i]._id; });

  await logAuditBatch([
    ...createdIncome.map((income) => ({
      actor: req.user._id, action: 'income.create', targetModel: 'Income', targetId: income._id,
      details: { receiptNumber: income.receiptNumber, amount: income.amount, source: 'statement', fileName: statement.fileName },
    })),
    ...createdExpense.map((expense) => ({
      actor: req.user._id, action: 'expense.create', targetModel: 'Expense', targetId: expense._id,
      details: { amount: expense.amount, type: expense.type, group: expense.group, item: expense.item || null, source: 'statement', fileName: statement.fileName },
    })),
  ]);

  statement.status = 'approved';
  statement.approvedBy = req.user._id;
  statement.approvedAt = new Date();
  await statement.save();
  await logAudit({
    actor: req.user._id, action: 'statement.approve', targetModel: 'Statement', targetId: statement._id,
    details: { fileName: statement.fileName, transactions: statement.transactions.length, posted: included.length },
  });
  res.json(await presentPopulated(statement));
}));

module.exports = router;
