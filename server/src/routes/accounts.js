const router = require('express').Router();
const { z } = require('zod');
const Account = require('../models/Account');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { logAudit } = require('../services/audit');

const number = z.string().trim().regex(/^\d{4,20}$/, 'Account number must be 4-20 digits');

const createSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    type: z.enum(['bank', 'cash']),
    bankName: z.string().trim().optional(),
    accountNumber: number.optional(),
    openingBalance: z.number().int().min(0).default(0),
  })
  .refine((d) => d.type === 'cash' || (d.bankName && d.accountNumber), {
    message: 'Bank accounts need a bank name and account number',
    path: ['bankName'],
  });

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  bankName: z.string().trim().optional(),
  accountNumber: number.optional(),
  openingBalance: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const filter = req.query.active === 'true' ? { active: true } : {};
  res.json(await Account.find(filter).sort('name'));
}));

router.post('/', requirePermission('accounts.manage'), validate(createSchema), asyncHandler(async (req, res) => {
  const acc = await Account.create(req.validated.body);
  await logAudit({
    actor: req.user._id, action: 'account.create', targetModel: 'Account', targetId: acc._id,
    details: { name: acc.name, type: acc.type, openingBalance: acc.openingBalance },
  });
  res.status(201).json(acc);
}));

router.patch('/:id', requirePermission('accounts.manage'), validate(updateSchema), asyncHandler(async (req, res) => {
  const acc = await Account.findByIdAndUpdate(req.params.id, { $set: req.validated.body }, { new: true, runValidators: true });
  if (!acc) throw new AppError(404, 'Account not found');
  await logAudit({
    actor: req.user._id, action: 'account.update', targetModel: 'Account', targetId: acc._id,
    details: { name: acc.name, changes: req.validated.body },
  });
  res.json(acc);
}));

module.exports = router;
