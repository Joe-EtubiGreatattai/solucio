const router = require('express').Router();
const { z } = require('zod');
const Income = require('../models/Income');
const Account = require('../models/Account');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseLagosDate } = require('../utils/dates');
const { recordDate, amount, objectId, voidBody, listQueryShape } = require('../utils/schemas');
const { dateFilter, statusFilter } = require('../utils/filters');
const { nextReceiptNumber } = require('../services/receiptNumber');
const { voidRecord } = require('../services/voidRecord');
const { logAudit } = require('../services/audit');
const { renderReceipt } = require('../services/receiptPdf');

const createSchema = z.object({
  amount,
  date: recordDate,
  method: z.enum(['transfer', 'pos'], { errorMap: () => ({ message: 'Choose transfer or POS' }) }),
  accountId: objectId,
});
const listQuery = z.object({ ...listQueryShape, method: z.enum(['transfer', 'pos']).optional() });

router.use(authenticate);

router.post('/', requirePermission('income.record'), validate(createSchema), asyncHandler(async (req, res) => {
  const { amount: amt, date, method, accountId } = req.validated.body;
  const account = await Account.findById(accountId);
  if (!account || !account.active) {
    throw new AppError(400, 'Account not found or inactive', { accountId: 'Choose an active account' });
  }
  const receiptNumber = await nextReceiptNumber(date.slice(0, 4));
  const income = await Income.create({
    amount: amt, date: parseLagosDate(date), method, account: account._id, receiptNumber, recordedBy: req.user._id,
  });
  await logAudit({ actor: req.user._id, action: 'income.create', targetModel: 'Income', targetId: income._id, details: { receiptNumber, amount: amt } });
  res.status(201).json(income);
}));

router.get('/', requirePermission('income.view'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const filter = { ...dateFilter(q.from, q.to), ...statusFilter(q.status) };
  if (q.accountId) filter.account = q.accountId;
  if (q.method) filter.method = q.method;
  const [items, total] = await Promise.all([
    Income.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('account', 'name type bankName accountNumber')
      .populate('recordedBy', 'name'),
    Income.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit });
}));

router.post('/:id/void', requirePermission('income.void'), validate(voidBody), asyncHandler(async (req, res) => {
  res.json(await voidRecord(Income, req.params.id, req.validated.body.reason, req.user, 'income.void'));
}));

router.get('/:id/receipt', requirePermission('income.view'), asyncHandler(async (req, res) => {
  const income = await Income.findById(req.params.id).populate('account').populate('recordedBy', 'name');
  if (!income) throw new AppError(404, 'Receipt not found');
  const pdf = await renderReceipt(income);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${income.receiptNumber}.pdf"` });
  res.send(pdf);
}));

module.exports = router;
