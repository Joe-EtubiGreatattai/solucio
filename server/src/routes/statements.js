const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const Statement = require('../models/Statement');
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
const { logAudit } = require('../services/audit');
const { nextReceiptNumber } = require('../services/receiptNumber');
const { assertValidCategory } = require('../services/categories');

const router = express.Router();
const listQuery = z.object({ accountId: objectId.optional() });
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
const populated = (id) => Statement.findById(id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name');

// A person has already decided this row, so automatic categorization must leave it alone.
const decidedByPerson = (t) => t.categorySource === 'reviewer' || (!t.categorySource && !!t.reviewedAt);
const suggestion = (r) => ({ type: r.type, group: r.group, item: r.item, confidence: r.confidence, reason: r.reason, categorySource: r.categorySource });

router.get('/', requirePermission('statements.view'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const filter = req.validated.query.accountId ? { account: req.validated.query.accountId } : {};
  const items = await Statement.find(filter).sort({ createdAt: -1 }).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name');
  res.json(items.map(present));
}));

router.get('/:id', requirePermission('statements.view'), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name');
  if (!statement) throw new AppError(404, 'Statement not found');
  res.json(present(await Statement.findById(statement._id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name')));
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
  const statement = await Statement.create({ account: account._id, fileName, holderName, sourcePdf: req.body, uploadedBy: req.user._id, transactions });
  await logAudit({ actor: req.user._id, action: 'statement.import', targetModel: 'Statement', targetId: statement._id, details: { fileName, account: account.name, transactions: result.transactions.length, pages: result.pageCount, checksum: crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 12) } });
  res.status(201).json(present(await Statement.findById(statement._id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name')));
}));

router.patch('/:id/transactions/:transactionId', requirePermission('statements.review'), validate(updateBody), asyncHandler(async (req, res) => {
  const statement = await Statement.findById(req.params.id);
  if (!statement) throw new AppError(404, 'Statement not found');
  if (statement.status === 'approved') throw new AppError(409, 'Approved statements cannot be changed');
  const transaction = statement.transactions.id(req.params.transactionId);
  if (!transaction) throw new AppError(404, 'Transaction not found');
  const body = req.validated.body;
  Object.assign(transaction, body, { reviewedBy: req.user._id, reviewedAt: new Date() });
  if (['type', 'group', 'item', 'direction', 'confidence'].some((key) => key in body)) {
    transaction.categorySource = 'reviewer';
    transaction.reason = `Chosen by ${req.user.name}`;
  }

  // Confirming a category teaches every other row to the same payee that nobody has decided yet.
  let similarUpdated = 0;
  const confirmed = body.confidence === 'high' && transaction.direction === 'expense' && transaction.type && transaction.group;
  const { key } = payeeOf(transaction.narration);
  if (confirmed && key && !isBankCharge(transaction.narration)) {
    for (const other of statement.transactions) {
      if (other._id.equals(transaction._id) || other.direction !== 'expense' || decidedByPerson(other) || isBankCharge(other.narration)) continue;
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
  res.json({ ...present(await populated(statement._id)), similarUpdated });
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
  res.json(present(await Statement.findById(statement._id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name')));
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
  res.json({ ...present(await populated(statement._id)), recategorized });
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
  for (const transaction of included) {
    if (transaction.direction !== 'expense') continue;
    try {
      await assertValidCategory(transaction.type, transaction.group, transaction.item);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      throw new AppError(409, `"${transaction.narration}" has a category that no longer exists. Fix it before approving.`);
    }
  }

  const account = await Account.findById(statement.account);
  if (!account || !account.active) throw new AppError(400, 'The account for this statement is no longer active.');

  for (const transaction of included) {
    if (transaction.direction === 'income') {
      const receiptNumber = await nextReceiptNumber(String(lagosYear(transaction.date)));
      const income = await Income.create({
        amount: transaction.amount, date: transaction.date, method: 'transfer', account: account._id,
        receiptNumber, recordedBy: req.user._id,
      });
      await logAudit({
        actor: req.user._id, action: 'income.create', targetModel: 'Income', targetId: income._id,
        details: { receiptNumber, amount: transaction.amount, source: 'statement', fileName: statement.fileName },
      });
      transaction.postedModel = 'Income';
      transaction.postedId = income._id;
    } else {
      const expense = await Expense.create({
        amount: transaction.amount, date: transaction.date, account: account._id,
        type: transaction.type, group: transaction.group, item: transaction.item || null,
        note: `Imported from ${statement.fileName}`, recordedBy: req.user._id,
      });
      await logAudit({
        actor: req.user._id, action: 'expense.create', targetModel: 'Expense', targetId: expense._id,
        details: { amount: transaction.amount, type: transaction.type, group: transaction.group, item: transaction.item || null, source: 'statement', fileName: statement.fileName },
      });
      transaction.postedModel = 'Expense';
      transaction.postedId = expense._id;
    }
  }

  statement.status = 'approved';
  statement.approvedBy = req.user._id;
  statement.approvedAt = new Date();
  await statement.save();
  await logAudit({
    actor: req.user._id, action: 'statement.approve', targetModel: 'Statement', targetId: statement._id,
    details: { fileName: statement.fileName, transactions: statement.transactions.length, posted: included.length },
  });
  res.json(present(await Statement.findById(statement._id).populate('account', 'name bankName accountNumber').populate('uploadedBy', 'name').populate('approvedBy', 'name')));
}));

module.exports = router;
