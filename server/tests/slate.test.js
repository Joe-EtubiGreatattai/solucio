const request = require('supertest');
const app = require('../src/app');
const Income = require('../src/models/Income');
const Expense = require('../src/models/Expense');
const Statement = require('../src/models/Statement');
const Category = require('../src/models/Category');
const Account = require('../src/models/Account');
const Counter = require('../src/models/Counter');
const { Slate, SlateArchive } = require('../src/models/Slate');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');

let admin;
let accountant;
let account;
let catCount; // default categories are already seeded by the test setup

beforeEach(async () => {
  admin = await createUser('admin');
  accountant = await createUser('accountant');
  account = await makeAccount({ openingBalance: 200000 });
  await makeIncome({ account, recordedBy: admin.user, amount: 500000 });
  await makeExpense({ account, recordedBy: admin.user, amount: 120000 });
  await Statement.create({ account: account._id, fileName: 'jan.pdf', uploadedBy: admin.user._id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), transactions: [{ date: new Date('2026-01-10'), narration: 'X', amount: 1000, direction: 'expense', type: 'Recurrent', group: 'Staff Wages', confidence: 'high' }] });
  await Counter.create({ key: 'receipt-2026', seq: 42 });
  catCount = await Category.countDocuments();
});

const newSlate = (body, token = admin.token) => request(app).post('/api/slates').set(auth(token)).send(body);

test('a non-admin cannot start a new slate', async () => {
  const res = await newSlate({ label: '2026', confirm: '2026' }, accountant.token);
  expect(res.status).toBe(403);
  expect(await Income.countDocuments()).toBe(1); // nothing cleared
});

test('the confirmation must match the year exactly', async () => {
  const res = await newSlate({ label: '2026', confirm: '2025' });
  expect(res.status).toBe(400);
  expect(await Income.countDocuments()).toBe(1);
  expect(await Slate.countDocuments()).toBe(0);
});

test('a new slate archives the year, then clears the system for the next', async () => {
  const res = await newSlate({ label: '2026', confirm: '2026' });
  expect(res.status).toBe(201);
  // Summary captured the year.
  expect(res.body.summary).toMatchObject({ incomeKobo: 500000, expenseKobo: 120000, netKobo: 380000, incomeCount: 1, expenseCount: 1, statementCount: 1, categoryCount: catCount });
  expect(catCount).toBeGreaterThan(0); // there were categories to clear
  expect(res.body.summary.accounts[0]).toMatchObject({ name: account.name, closingKobo: 200000 + 500000 - 120000 });

  // The live system is cleared.
  expect(await Income.countDocuments()).toBe(0);
  expect(await Expense.countDocuments()).toBe(0);
  expect(await Statement.countDocuments()).toBe(0);
  expect(await Category.countDocuments()).toBe(0);
  expect(await Counter.countDocuments()).toBe(0); // receipt numbers reset
  expect((await Account.findById(account._id)).openingBalance).toBe(0); // balances zeroed
  // The account itself is kept.
  expect(await Account.countDocuments()).toBe(1);

  // Nothing was lost: the archive holds every record.
  expect(await SlateArchive.countDocuments({ slate: res.body._id, kind: 'income' })).toBe(1);
  expect(await SlateArchive.countDocuments({ slate: res.body._id, kind: 'expense' })).toBe(1);
  expect(await SlateArchive.countDocuments({ slate: res.body._id, kind: 'statement' })).toBe(1);
  expect(await SlateArchive.countDocuments({ slate: res.body._id, kind: 'category' })).toBe(catCount);
});

test('past slates can be listed and exported as a backup', async () => {
  const created = (await newSlate({ label: '2026', confirm: '2026' })).body;
  const list = await request(app).get('/api/slates').set(auth(admin.token));
  expect(list.status).toBe(200);
  expect(list.body.map((s) => s.label)).toEqual(['2026']);

  const dump = await request(app).get(`/api/slates/${created._id}/export`).set(auth(admin.token));
  expect(dump.status).toBe(200);
  expect(dump.headers['content-disposition']).toMatch(/slate-2026\.json/);
  expect(dump.body.data.income).toHaveLength(1);
  expect(dump.body.data.expense).toHaveLength(1);
});
