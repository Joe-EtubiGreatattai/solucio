const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Account = require('../src/models/Account');
const Income = require('../src/models/Income');
const Expense = require('../src/models/Expense');

let n = 0;
async function createUser(role = 'admin', overrides = {}) {
  n += 1;
  const user = await User.create({
    name: `${role} ${n}`,
    email: `${role}${n}@test.com`,
    passwordHash: await bcrypt.hash('password123', 4),
    role,
    ...overrides,
  });
  const token = jwt.sign({ sub: user.id, role }, process.env.JWT_SECRET);
  return { user, token };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeAccount(overrides = {}) {
  return Account.create({
    name: 'Main Account', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789', openingBalance: 0, ...overrides,
  });
}

let seq = 0;
async function makeIncome({ account, recordedBy, amount = 100000, date = '2026-01-15T10:00:00Z', voided = false, voidReason, ...rest }) {
  seq += 1;
  const doc = {
    account: account._id, recordedBy: recordedBy._id, amount, date: new Date(date), method: 'transfer',
    receiptNumber: `T-${seq}`, voided, ...rest,
  };
  if (voided && voidReason) doc.voidReason = voidReason;
  else if (voided) doc.voidReason = 'test';
  return Income.create(doc);
}
async function makeExpense({ account, recordedBy, amount = 50000, date = '2026-01-15T10:00:00Z', type = 'Recurrent', group = 'Staff Wages', item = null, voided = false, voidReason, ...rest }) {
  const doc = {
    account: account._id, recordedBy: recordedBy._id, amount, date: new Date(date), type, group, item, voided, ...rest,
  };
  if (voided && voidReason) doc.voidReason = voidReason;
  else if (voided) doc.voidReason = 'test';
  return Expense.create(doc);
}

module.exports = { createUser, auth, makeAccount, makeIncome, makeExpense };
