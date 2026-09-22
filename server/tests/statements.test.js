const request = require('supertest');
const app = require('../src/app');
const Statement = require('../src/models/Statement');
const AuditLog = require('../src/models/AuditLog');
const Income = require('../src/models/Income');
const Expense = require('../src/models/Expense');
const { createUser, auth, makeAccount } = require('./helpers');

let admin;
let accountant;
let account;

beforeEach(async () => {
  admin = await createUser('admin');
  accountant = await createUser('accountant');
  account = await makeAccount();
});

async function makeStatement(transactions) {
  return Statement.create({
    account: account._id,
    fileName: 'july-statement.pdf',
    uploadedBy: admin.user._id,
    transactions: transactions || [{
      date: new Date('2026-07-15T00:00:00Z'), narration: 'IBEDC PREPAID METER', amount: 975000,
      direction: 'expense', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence: 'needs-review',
    }],
  });
}
const expenseRow = (overrides = {}) => ({
  date: new Date('2026-07-15T00:00:00Z'), narration: 'IBEDC PREPAID METER', amount: 975000,
  direction: 'expense', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence: 'high', ...overrides,
});
const incomeRow = (overrides = {}) => ({
  date: new Date('2026-07-16T00:00:00Z'), narration: 'NIP TFR FROM PATIENT', amount: 500000,
  direction: 'income', confidence: 'high', ...overrides,
});

test('lists statements for people with statement access', async () => {
  await makeStatement([expenseRow()]);
  const res = await request(app).get('/api/statements').set(auth(accountant.token));
  expect(res.status).toBe(200);
  expect(res.body[0]).toMatchObject({ fileName: 'july-statement.pdf', account: { name: 'Main Account' } });
});

test('a reviewer can correct a transaction and approval remains blocked until it is reviewed', async () => {
  const statement = await makeStatement([expenseRow({ confidence: 'needs-review' })]);
  const transactionId = statement.transactions[0]._id;
  const blocked = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
  expect(blocked.status).toBe(409);

  const changed = await request(app).patch(`/api/statements/${statement.id}/transactions/${transactionId}`)
    .set(auth(accountant.token))
    .send({ type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence: 'high' });
  expect(changed.status).toBe(200);
  expect(changed.body.transactions[0]).toMatchObject({ confidence: 'high', reviewedBy: accountant.user.id });

  const approved = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
  expect(approved.status).toBe(200);
  expect(approved.body).toMatchObject({ status: 'approved', approvedBy: { _id: admin.user.id } });
  expect(await AuditLog.findOne({ action: 'statement.approve' })).toBeTruthy();
});

test('approved statements cannot be changed', async () => {
  const statement = await makeStatement([expenseRow()]);
  await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
  const res = await request(app).patch(`/api/statements/${statement.id}/transactions/${statement.transactions[0]._id}`)
    .set(auth(accountant.token)).send({ confidence: 'medium' });
  expect(res.status).toBe(409);
});

test('an import request without a PDF is rejected before processing', async () => {
  const res = await request(app).post(`/api/statements/import?accountId=${account.id}&fileName=empty.pdf`).set(auth(admin.token));
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/PDF statement/i);
});

describe('approving posts real records', () => {
  test('an included expense row becomes an Expense, with the statement noted', async () => {
    const statement = await makeStatement([expenseRow()]);
    const approved = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(approved.status).toBe(200);
    expect(approved.body.transactions[0]).toMatchObject({ postedModel: 'Expense' });

    const expenses = await Expense.find();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      amount: 975000, type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity',
      account: account._id, recordedBy: admin.user._id, voided: false,
    });
    expect(expenses[0].note).toMatch(/july-statement\.pdf/);
    expect(String(expenses[0]._id)).toBe(String(approved.body.transactions[0].postedId));
    expect(await AuditLog.findOne({ action: 'expense.create', targetId: expenses[0]._id })).toBeTruthy();
  });

  test('an included income row becomes an Income, with its own receipt number', async () => {
    const statement = await makeStatement([incomeRow()]);
    const approved = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(approved.status).toBe(200);

    const incomes = await Income.find();
    expect(incomes).toHaveLength(1);
    expect(incomes[0]).toMatchObject({ amount: 500000, method: 'transfer', account: account._id, recordedBy: admin.user._id, voided: false });
    expect(incomes[0].receiptNumber).toMatch(/^RCP-2026-\d{4}$/);
    expect(approved.body.transactions[0].postedModel).toBe('Income');
    expect(await AuditLog.findOne({ action: 'income.create', targetId: incomes[0]._id })).toBeTruthy();
  });

  test('an excluded row is skipped: no record, no review requirement, does not block approval', async () => {
    const statement = await makeStatement([
      expenseRow({ included: false, confidence: 'needs-review', type: undefined, group: undefined, item: undefined }),
      incomeRow(),
    ]);
    const approved = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(approved.status).toBe(200);
    expect(await Expense.countDocuments()).toBe(0);
    expect(await Income.countDocuments()).toBe(1);
    expect(approved.body.transactions[0].postedModel).toBeUndefined();
  });

  test('a statement with everything excluded cannot be approved', async () => {
    const statement = await makeStatement([expenseRow({ included: false })]);
    const res = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least one/i);
    expect(await Expense.countDocuments()).toBe(0);
  });

  test('an expense whose category no longer exists blocks approval, and nothing else in the statement is posted either', async () => {
    const statement = await makeStatement([
      expenseRow({ type: 'Recurrent', group: 'Made Up Group', item: null }),
      incomeRow(),
    ]);
    const res = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/category that no longer exists/i);
    expect(await Expense.countDocuments()).toBe(0);
    expect(await Income.countDocuments()).toBe(0);
    expect((await Statement.findById(statement.id)).status).toBe('review');
  });
});

describe('choosing which rows to import', () => {
  test('a reviewer can change a row from expense to income, or back', async () => {
    const statement = await makeStatement([expenseRow()]);
    const id = statement.transactions[0]._id;
    const res = await request(app).patch(`/api/statements/${statement.id}/transactions/${id}`)
      .set(auth(accountant.token)).send({ direction: 'income' });
    expect(res.status).toBe(200);
    expect(res.body.transactions[0].direction).toBe('income');

    const approved = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(approved.status).toBe(200);
    expect(await Income.countDocuments()).toBe(1);
    expect(await Expense.countDocuments()).toBe(0);
  });

  test('a row can be excluded and re-included', async () => {
    const statement = await makeStatement([expenseRow()]);
    const id = statement.transactions[0]._id;
    const off = await request(app).patch(`/api/statements/${statement.id}/transactions/${id}`)
      .set(auth(accountant.token)).send({ included: false });
    expect(off.body.transactions[0].included).toBe(false);
    const on = await request(app).patch(`/api/statements/${statement.id}/transactions/${id}`)
      .set(auth(accountant.token)).send({ included: true });
    expect(on.body.transactions[0].included).toBe(true);
  });

  test('a bulk scope keeps only income rows, only expense rows, or everything', async () => {
    const statement = await makeStatement([expenseRow(), incomeRow()]);

    const onlyIncome = await request(app).patch(`/api/statements/${statement.id}/include`).set(auth(accountant.token)).send({ scope: 'income' });
    expect(onlyIncome.status).toBe(200);
    const [exp1, inc1] = onlyIncome.body.transactions;
    expect(exp1.included).toBe(false);
    expect(inc1.included).toBe(true);

    const onlyExpense = await request(app).patch(`/api/statements/${statement.id}/include`).set(auth(accountant.token)).send({ scope: 'expense' });
    const [exp2, inc2] = onlyExpense.body.transactions;
    expect(exp2.included).toBe(true);
    expect(inc2.included).toBe(false);

    const all = await request(app).patch(`/api/statements/${statement.id}/include`).set(auth(accountant.token)).send({ scope: 'all' });
    expect(all.body.transactions.every((t) => t.included)).toBe(true);
    expect(await AuditLog.findOne({ action: 'statement.bulk-include' })).toBeTruthy();
  });

  test('bulk include is refused on an approved statement, and to someone without review access', async () => {
    const statement = await makeStatement([expenseRow()]);
    const cashier = await createUser('cashier');
    const denied = await request(app).patch(`/api/statements/${statement.id}/include`).set(auth(cashier.token)).send({ scope: 'all' });
    expect(denied.status).toBe(403);

    await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    const res = await request(app).patch(`/api/statements/${statement.id}/include`).set(auth(accountant.token)).send({ scope: 'all' });
    expect(res.status).toBe(409);
  });
});
