const router = require('express').Router();
const { z } = require('zod');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseLagosDate } = require('../utils/dates');
const { recordDate, amount, objectId, voidBody, listQueryShape } = require('../utils/schemas');
const { dateFilter, statusFilter } = require('../utils/filters');
const { isValidCategory } = require('../config/categories');
const { voidRecord } = require('../services/voidRecord');
const { logAudit } = require('../services/audit');

const createSchema = z
  .object({
    amount,
    date: recordDate,
    accountId: objectId,
    type: z.string(),
    group: z.string(),
    item: z.string().nullish(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => isValidCategory(d.type, d.group, d.item), { message: 'Choose a valid category', path: ['category'] });

const listQuery = z.object({
  ...listQueryShape,
  type: z.string().optional(),
  group: z.string().optional(),
  item: z.string().optional(),
});

router.use(authenticate, requireRole('accountant', 'admin'));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const account = await Account.findById(b.accountId);
  if (!account || !account.active) {
    throw new AppError(400, 'Account not found or inactive', { accountId: 'Choose an active account' });
  }
  const expense = await Expense.create({
    amount: b.amount, date: parseLagosDate(b.date), account: account._id,
    type: b.type, group: b.group, item: b.item || null, note: b.note, recordedBy: req.user._id,
  });
  await logAudit({ actor: req.user._id, action: 'expense.create', targetModel: 'Expense', targetId: expense._id, details: { amount: b.amount, type: b.type, group: b.group, item: b.item || null } });
  res.status(201).json(expense);
}));

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const filter = { ...dateFilter(q.from, q.to), ...statusFilter(q.status) };
  if (q.accountId) filter.account = q.accountId;
  for (const k of ['type', 'group', 'item']) if (q[k]) filter[k] = q[k];
  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('account', 'name type bankName accountNumber')
      .populate('recordedBy', 'name'),
    Expense.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit });
}));

router.post('/:id/void', validate(voidBody), asyncHandler(async (req, res) => {
  res.json(await voidRecord(Expense, req.params.id, req.validated.body.reason, req.user, 'expense.void'));
}));

module.exports = router;
