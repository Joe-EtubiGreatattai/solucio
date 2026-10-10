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

describe('smarter categorization', () => {
  const payTo = (name, overrides = {}) => expenseRow({ narration: `MOBILE TRF TO PAY/ /${name}`, type: undefined, group: undefined, item: null, confidence: 'needs-review', ...overrides });
  const patch = (statement, id, body) => request(app).patch(`/api/statements/${statement.id}/transactions/${id}`).set(auth(accountant.token)).send(body);

  test('marking a row reviewed teaches every unreviewed row to the same payee in the statement', async () => {
    const statement = await makeStatement([
      payTo('ZAINAB LADIDI SHAIBU', { type: 'Recurrent', group: 'Staff Wages' }),
      payTo('ZAINAB LADIDI SHAIBU'),
      expenseRow({ narration: 'MOBILE TRF TO GTB/ ZAINAB LADIDI SHAIBU', type: undefined, group: undefined, item: null, confidence: 'needs-review' }),
      payTo('SOMEONE ELSE'),
      expenseRow({ narration: 'COMMISSION MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU', type: 'Recurrent', group: 'Tax and Dues', item: 'Others', confidence: 'high' }),
      payTo('ZAINAB LADIDI SHAIBU', { type: 'Recurrent', group: 'Charity', confidence: 'high', categorySource: 'reviewer' }),
    ]);
    const res = await patch(statement, statement.transactions[0]._id, { confidence: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.similarUpdated).toBe(2);
    const [chosen, same, otherBank, someoneElse, charge, decidedBefore] = res.body.transactions;
    expect(chosen).toMatchObject({ categorySource: 'reviewer', group: 'Staff Wages' });
    for (const row of [same, otherBank]) expect(row).toMatchObject({ group: 'Staff Wages', confidence: 'high', categorySource: 'similar', reason: expect.stringMatching(/same payee/i) });
    expect(someoneElse.confidence).toBe('needs-review');
    expect(charge.group).toBe('Tax and Dues'); // the bank's fee on a transfer to Zainab is not Zainab
    expect(decidedBefore.group).toBe('Charity'); // another reviewer's choice is never overwritten
  });

  test('editing a category without confirming it does not spread to other rows', async () => {
    const statement = await makeStatement([payTo('ADA OKON'), payTo('ADA OKON')]);
    const res = await patch(statement, statement.transactions[0]._id, { type: 'Recurrent', group: 'Staff Wages', item: null, confidence: 'needs-review' });
    expect(res.body.similarUpdated).toBe(0);
    expect(res.body.transactions[1].group).toBeFalsy();
  });

  test('re-checking a statement recategorizes unreviewed rows and learns from other statements', async () => {
    await Statement.create({
      account: account._id, fileName: 'june.pdf', uploadedBy: admin.user._id, status: 'review',
      transactions: [payTo('ADA OKON', { type: 'Recurrent', group: 'Staff Wages', confidence: 'high', categorySource: 'reviewer' })],
    });
    const statement = await makeStatement([
      payTo('ADA OKON'),
      expenseRow({ narration: 'MOBILE BILLS PYMT/ AIRTEL DATA/0911', type: undefined, group: undefined, item: null, confidence: 'needs-review' }),
      payTo('KEPT AS IS', { type: 'Recurrent', group: 'Charity', confidence: 'high', categorySource: 'reviewer' }),
    ]);
    const res = await request(app).post(`/api/statements/${statement.id}/recategorize`).set(auth(accountant.token));
    expect(res.status).toBe(200);
    const [ada, airtel, kept] = res.body.transactions;
    expect(ada).toMatchObject({ group: 'Staff Wages', categorySource: 'memory', confidence: 'high' });
    expect(airtel).toMatchObject({ group: 'Servicing & Maintenance', item: 'Data & Airtime', categorySource: 'rule', reason: expect.stringMatching(/AIRTEL/) });
    expect(kept).toMatchObject({ group: 'Charity', categorySource: 'reviewer' });
    expect(res.body.recategorized).toMatchObject({ checked: 2, changed: 2, needReview: 0 });
    expect(await AuditLog.findOne({ action: 'statement.recategorize' })).toBeTruthy();
  });

  test('re-checking uses the account holder named on the statement to spot own-account transfers', async () => {
    const statement = await Statement.create({
      account: account._id, fileName: 'zenith.pdf', uploadedBy: admin.user._id, holderName: 'SOLUCIO CLINICS',
      transactions: [incomeRow({ narration: 'NIP CR/MOB/SOLUCIO CLINICS LIMITED/ROLEZ/Moniepoint active', confidence: 'medium' })],
    });
    const res = await request(app).post(`/api/statements/${statement.id}/recategorize`).set(auth(accountant.token));
    expect(res.body.transactions[0]).toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/own account/) });
  });

  test('approved statements cannot be re-checked', async () => {
    const statement = await makeStatement([expenseRow()]);
    await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    const res = await request(app).post(`/api/statements/${statement.id}/recategorize`).set(auth(accountant.token));
    expect(res.status).toBe(409);
  });
});

describe('income categories on import', () => {
  const Income = require('../src/models/Income');
  const incomeRowCat = (overrides = {}) => incomeRow({ type: 'Diagnostics', group: 'Laboratory', item: null, confidence: 'high', ...overrides });

  test('an approved income row posts an Income with its income category', async () => {
    const statement = await makeStatement([incomeRowCat()]);
    const res = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(res.status).toBe(200);
    const income = await Income.findOne({});
    expect(income).toMatchObject({ type: 'Diagnostics', group: 'Laboratory', item: null });
  });

  test('income with no category still imports, just uncategorized', async () => {
    const statement = await makeStatement([incomeRow({ confidence: 'high' })]);
    await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    const income = await Income.findOne({});
    expect(income.type).toBeNull();
  });

  test('an income category that no longer exists blocks approval', async () => {
    const statement = await makeStatement([incomeRowCat({ group: 'Gone' })]);
    const res = await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    expect(res.status).toBe(409);
    expect(await Income.countDocuments()).toBe(0);
  });

  test('confirming an income category spreads to other income rows from the same payee', async () => {
    const statement = await makeStatement([
      incomeRow({ narration: 'NIP CR/MOB/PATIENT ADA/GTB', confidence: 'needs-review' }),
      incomeRow({ narration: 'NIP CR/MOB/PATIENT ADA/GTB', confidence: 'needs-review' }),
      incomeRow({ narration: 'NIP CR/MOB/SOMEONE ELSE/GTB', confidence: 'needs-review' }),
    ]);
    const res = await request(app).patch(`/api/statements/${statement.id}/transactions/${statement.transactions[0]._id}`)
      .set(auth(accountant.token)).send({ type: 'Diagnostics', group: 'Laboratory', item: null, confidence: 'high' });
    expect(res.body.similarUpdated).toBe(1);
    expect(res.body.transactions[1]).toMatchObject({ group: 'Laboratory', categorySource: 'similar' });
    expect(res.body.transactions[2].group).toBeFalsy();
  });
});

describe('deleting a statement', () => {
  const del = (token, statement) => request(app).delete(`/api/statements/${statement.id}`).set(auth(token));

  test('an admin can delete a statement still in review, and it is audited', async () => {
    const statement = await makeStatement([expenseRow(), incomeRow()]);
    const res = await del(admin.token, statement);
    expect(res.status).toBe(200);
    expect(await Statement.findById(statement.id)).toBeNull();
    const log = await AuditLog.findOne({ action: 'statement.delete' }).lean();
    expect(log.details).toMatchObject({ fileName: 'july-statement.pdf', transactions: 2 });
  });

  test('an approved statement cannot be deleted, because its rows are already records', async () => {
    const statement = await makeStatement([expenseRow()]);
    await request(app).post(`/api/statements/${statement.id}/approve`).set(auth(admin.token));
    const res = await del(admin.token, statement);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/void/i);
    expect(await Statement.findById(statement.id)).toBeTruthy();
    expect(await Expense.countDocuments()).toBe(1);
  });

  test('only admins can delete, and an unknown statement is 404', async () => {
    const statement = await makeStatement([expenseRow()]);
    expect((await del(accountant.token, statement)).status).toBe(403);
    expect((await request(app).delete('/api/statements/64b7f0000000000000000000').set(auth(admin.token))).status).toBe(404);
  });
});
