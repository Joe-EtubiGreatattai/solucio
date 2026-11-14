// Server-to-server connection for Solucio Payroll. Payroll records the salaries it paid (and the
// Paystack fees and stamp duty) as expenses here, so the hospital's books stay complete without
// anyone typing payroll in twice.
//
//   POST /api/integrations/payroll/expenses   { ref, date, lines: [{ kind, amount, note }] }
//
// Off unless PAYROLL_INTEGRATION_KEY (24+ characters) is set. Payroll sends the same value in the
// x-integration-key header. Each line has a unique reference, so sending the same run twice
// never records it twice.
const crypto = require('crypto');
const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const Expense = require('../models/Expense');
const Account = require('../models/Account');
const Category = require('../models/Category');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseLagosDate } = require('../utils/dates');
const { logAudit } = require('../services/audit');

// Where payroll lines are filed. Change these in .env if the hospital uses different names.
const SALARY_TYPE = () => process.env.PAYROLL_SALARY_TYPE || 'Recurrent';
const SALARY_GROUP = () => process.env.PAYROLL_SALARY_GROUP || 'Staff Wages';
const FEES_GROUP = () => process.env.PAYROLL_FEES_GROUP || 'Bank Charges';
const ACCOUNT_NAME = () => process.env.PAYROLL_ACCOUNT_NAME || 'Paystack (payroll)';

function requireKey(req, res, next) {
  const expected = process.env.PAYROLL_INTEGRATION_KEY || '';
  if (expected.length < 24) return next(new AppError(503, 'The payroll connection is turned off'));
  const given = String(req.headers['x-integration-key'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return next(new AppError(401, 'Wrong payroll connection key'));
  next();
}

// The account payroll pays from, created the first time it's needed
async function payrollAccount() {
  let acc = await Account.findOne({ name: ACCOUNT_NAME() });
  if (!acc) acc = await Account.create({ name: ACCOUNT_NAME(), type: 'bank', bankName: 'Paystack', active: true });
  return acc;
}

// Who "recorded" these lines: a system user that can't sign in
async function payrollUser() {
  const email = 'payroll-system@solucio.internal';
  let u = await User.findOne({ email });
  if (!u) {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    u = await User.create({ name: 'Solucio Payroll', email, passwordHash: hash, role: 'admin', active: false });
  }
  return u;
}

// Make sure the category exists. Only adds what's missing; never renames or hides anything.
async function ensureGroup(type, group, items = []) {
  const cat = await Category.findOne({ kind: 'expense', name: type });
  if (!cat) throw new AppError(400, `Expense category "${type}" doesn't exist`);
  const g = cat.groups.find((x) => x.name.toLowerCase() === group.toLowerCase());
  if (!g) {
    cat.groups.push({ name: group, items: items.map((name) => ({ name })) });
    await cat.save();
    return { group, hasItems: items.length > 0 };
  }
  // An existing group without items stays that way (adding items would change how old entries are filed)
  if (!g.items.length) return { group: g.name, hasItems: false };
  const missing = items.filter((i) => !g.items.some((x) => x.name.toLowerCase() === i.toLowerCase()));
  if (missing.length) {
    for (const name of missing) g.items.push({ name });
    await cat.save();
  }
  return { group: g.name, hasItems: true };
}

const body = z.object({
  ref: z.string().regex(/^[a-z0-9:_-]{6,80}$/i, 'Bad reference'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({
    kind: z.enum(['salaries', 'paystack_fees', 'stamp_duty']),
    amount: z.number().int().positive().max(10_000_000_000_000),
    note: z.string().trim().max(500),
  })).min(1).max(3),
});

router.use('/payroll', requireKey);

router.get('/payroll/ping', (req, res) => res.json({ ok: true, app: 'Solucio Payment and Receipt' }));

router.post('/payroll/expenses', asyncHandler(async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid request');
  const { ref, date, lines } = parsed.data;
  const [account, user] = await Promise.all([payrollAccount(), payrollUser()]);
  const salary = await ensureGroup(SALARY_TYPE(), SALARY_GROUP());
  const fees = await ensureGroup(SALARY_TYPE(), FEES_GROUP(), ['Paystack fees', 'Stamp duty']);

  const where = {
    salaries: { type: SALARY_TYPE(), group: salary.group, item: null },
    paystack_fees: { type: SALARY_TYPE(), group: fees.group, item: fees.hasItems ? 'Paystack fees' : null },
    stamp_duty: { type: SALARY_TYPE(), group: fees.group, item: fees.hasItems ? 'Stamp duty' : null },
  };
  const recorded = [];
  for (const line of lines) {
    const externalRef = `${ref}:${line.kind}`;
    const existing = await Expense.findOne({ externalRef });
    if (existing) { recorded.push({ kind: line.kind, id: existing._id, existed: true }); continue; }
    try {
      const e = await Expense.create({
        amount: line.amount, date: parseLagosDate(date), account: account._id, ...where[line.kind],
        note: line.note, recordedBy: user._id, externalRef, source: 'solucio-payroll',
      });
      await logAudit({ actor: user._id, action: 'expense.create', targetModel: 'Expense', targetId: e._id, details: { amount: line.amount, from: 'Solucio Payroll', ref: externalRef } });
      recorded.push({ kind: line.kind, id: e._id, existed: false });
    } catch (err) {
      if (err.code !== 11000) throw err; // sent twice at the same moment: already recorded
      recorded.push({ kind: line.kind, existed: true });
    }
  }
  res.status(201).json({ ok: true, recorded });
}));

// ---------- Solucio EMR ----------
// Patient payments (and HMO claim payments) taken in the EMR become income here with a receipt number.
//   POST /api/integrations/emr/incomes  { ref, date, amount (kobo), method, note, kind: patient | hmo_claim }
// Off unless EMR_INTEGRATION_KEY (24+ characters) is set; the EMR sends it as RECEIPTS_API_KEY.
const Income = require('../models/Income');
const { nextReceiptNumber } = require('../services/receiptNumber');

function requireEmrKey(req, res, next) {
  const expected = process.env.EMR_INTEGRATION_KEY || '';
  if (expected.length < 24) return next(new AppError(503, 'The EMR connection is turned off'));
  const given = String(req.headers['x-integration-key'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return next(new AppError(401, 'Wrong EMR connection key'));
  next();
}

// Which account EMR money goes into: EMR_INCOME_ACCOUNT by name, else the first active account
async function emrAccount() {
  const name = process.env.EMR_INCOME_ACCOUNT;
  const acc = (name && await Account.findOne({ name, active: true })) || await Account.findOne({ active: true }).sort({ createdAt: 1 });
  if (!acc) throw new AppError(503, 'No active account to record EMR payments in. Add one in Admin → Accounts.');
  return acc;
}

async function emrUser() {
  const email = 'emr-system@solucio.internal';
  let u = await User.findOne({ email });
  if (!u) {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    u = await User.create({ name: 'Solucio EMR', email, passwordHash: hash, role: 'admin', active: false });
  }
  return u;
}

// File under an income category only if the hospital still has it (admins can rename the tree)
async function filing(kind) {
  const [type, group] = kind === 'hmo_claim' ? ['HMO & Insurance', 'HMO Claims'] : [process.env.EMR_PATIENT_INCOME_TYPE || 'Patient Services', null];
  const cat = await Category.findOne({ kind: 'income', name: type });
  if (!cat) return { type: null, group: null, item: null };
  const g = group && cat.groups.find((x) => x.name.toLowerCase() === group.toLowerCase());
  return { type, group: g ? g.name : null, item: null };
}

const emrBody = z.object({
  ref: z.string().regex(/^[a-z0-9:_-]{6,80}$/i, 'Bad reference'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().positive().max(10_000_000_000_000),
  method: z.enum(['cash', 'pos', 'transfer']),
  note: z.string().trim().max(500).optional(),
  kind: z.enum(['patient', 'hmo_claim']).default('patient'),
});

router.use('/emr', requireEmrKey);
router.get('/emr/ping', (req, res) => res.json({ ok: true, app: 'Solucio Payment and Receipt' }));
router.post('/emr/incomes', asyncHandler(async (req, res) => {
  const parsed = emrBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid request');
  const { ref, date, amount, method, note, kind } = parsed.data;
  const existing = await Income.findOne({ externalRef: ref });
  if (existing) return res.status(201).json({ receiptNumber: existing.receiptNumber, existed: true });
  const [account, user, where] = await Promise.all([emrAccount(), emrUser(), filing(kind)]);
  try {
    const income = await Income.create({
      amount, date: parseLagosDate(date), method, account: account._id, ...where, note,
      receiptNumber: await nextReceiptNumber(date.slice(0, 4)), recordedBy: user._id, externalRef: ref, source: 'solucio-emr',
    });
    await logAudit({ actor: user._id, action: 'income.create', targetModel: 'Income', targetId: income._id, details: { amount, from: 'Solucio EMR', ref } });
    res.status(201).json({ receiptNumber: income.receiptNumber, existed: false });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const again = await Income.findOne({ externalRef: ref }); // sent twice at the same moment
    res.status(201).json({ receiptNumber: again.receiptNumber, existed: true });
  }
}));

module.exports = router;
