const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let admin, cashier, account;
beforeEach(async () => {
  admin = await createUser('admin');
  cashier = await createUser('cashier');
  account = await makeAccount();
});
const body = (o = {}) => ({ amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id, ...o });
const post = (token, o) => request(app).post('/api/incomes').set(auth(token)).send(body(o));

test('cashier records income and gets a receipt number', async () => {
  const res = await post(cashier.token);
  expect(res.status).toBe(201);
  expect(res.body.receiptNumber).toBe('RCP-2026-0001');
  expect(res.body.amount).toBe(150000);
  expect(res.body.recordedBy).toBe(cashier.user.id);
  expect(res.body.voided).toBe(false);
});

test('rejects amounts above the maximum and never stores 1e17+1', async () => {
  const over = await post(cashier.token, { amount: 10_000_000_000_001 });
  expect(over.status).toBe(400);
  expect(over.body.fields.amount).toBeDefined();
  expect((await post(cashier.token, { amount: 1e17 + 1 })).status).toBe(400);
  expect((await post(cashier.token, { amount: 10_000_000_000_000 })).status).toBe(201);
});

test('rejects future dates, non-integer and zero amounts', async () => {
  expect((await post(cashier.token, { date: '2999-01-01' })).body.fields.date).toBeDefined();
  expect((await post(cashier.token, { amount: 10.5 })).body.fields.amount).toBeDefined();
  expect((await post(cashier.token, { amount: 0 })).status).toBe(400);
});

test('rejects unknown method and inactive accounts', async () => {
  expect((await post(cashier.token, { method: 'cheque' })).status).toBe(400);
  account.active = false;
  await account.save();
  const res = await post(cashier.token);
  expect(res.status).toBe(400);
  expect(res.body.fields.accountId).toBeDefined();
});

test('accepts cash as a method', async () => {
  const res = await post(cashier.token, { method: 'cash' });
  expect(res.status).toBe(201);
  expect(res.body.method).toBe('cash');
});

test('20 concurrent creates get unique, gap-free receipt numbers', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => post(cashier.token)));
  expect(results.every((r) => r.status === 201)).toBe(true);
  const nums = results.map((r) => r.body.receiptNumber).sort();
  expect(new Set(nums).size).toBe(20);
  expect(nums[0]).toBe('RCP-2026-0001');
  expect(nums[19]).toBe('RCP-2026-0020');
});

test('numbering is per year', async () => {
  expect((await post(cashier.token, { date: '2025-12-31' })).body.receiptNumber).toBe('RCP-2025-0001');
  expect((await post(cashier.token, { date: '2026-01-01' })).body.receiptNumber).toBe('RCP-2026-0001');
});

test('list filters by date and status, keeps voided rows, populates account', async () => {
  const a = await post(cashier.token, { date: '2026-01-10' });
  await post(cashier.token, { date: '2026-01-20' });
  await request(app).post(`/api/incomes/${a.body._id}/void`).set(auth(cashier.token)).send({ reason: 'Wrong amount' });
  const all = await request(app).get('/api/incomes').set(auth(cashier.token));
  expect(all.body.total).toBe(2);
  expect(all.body.items[0].account.name).toBe('Main Account');
  const ranged = await request(app).get('/api/incomes?from=2026-01-15&to=2026-01-31').set(auth(cashier.token));
  expect(ranged.body.total).toBe(1);
  const voided = await request(app).get('/api/incomes?status=voided').set(auth(cashier.token));
  expect(voided.body.items.map((i) => i.voided)).toEqual([true]);
});

test('list filters by account and method', async () => {
  const other = await makeAccount({ name: 'Second Account' });
  await post(cashier.token, { method: 'transfer' });
  await post(cashier.token, { method: 'pos' });
  await post(cashier.token, { accountId: other.id, method: 'pos' });

  const byMethod = await request(app).get('/api/incomes?method=pos').set(auth(cashier.token));
  expect(byMethod.body.total).toBe(2);
  expect(byMethod.body.items.every((i) => i.method === 'pos')).toBe(true);

  const byAccount = await request(app).get(`/api/incomes?accountId=${other.id}`).set(auth(cashier.token));
  expect(byAccount.body.total).toBe(1);
  expect(byAccount.body.items[0].account.name).toBe('Second Account');

  const both = await request(app).get(`/api/incomes?accountId=${other.id}&method=transfer`).set(auth(cashier.token));
  expect(both.body.total).toBe(0);
});

test('void needs a reason, works once, and is audited', async () => {
  const created = await post(cashier.token);
  const url = `/api/incomes/${created.body._id}/void`;
  expect((await request(app).post(url).set(auth(cashier.token)).send({})).status).toBe(400);
  const ok = await request(app).post(url).set(auth(cashier.token)).send({ reason: 'Entered twice' });
  expect(ok.status).toBe(200);
  expect(ok.body.voided).toBe(true);
  expect(ok.body.voidReason).toBe('Entered twice');
  expect((await request(app).post(url).set(auth(cashier.token)).send({ reason: 'Again' })).status).toBe(409);
  const logs = await AuditLog.find().sort('createdAt');
  expect(logs.map((l) => l.action)).toEqual(['income.create', 'income.void']);
  expect(logs[1].details.reason).toBe('Entered twice');
});

test('voiding a missing record is 404', async () => {
  const res = await request(app).post('/api/incomes/64b7f0000000000000000000/void').set(auth(admin.token)).send({ reason: 'test' });
  expect(res.status).toBe(404);
});

test('there is no way to edit or delete income', async () => {
  const created = await post(cashier.token);
  expect((await request(app).patch(`/api/incomes/${created.body._id}`).set(auth(admin.token)).send({ amount: 1 })).status).toBe(404);
  expect((await request(app).delete(`/api/incomes/${created.body._id}`).set(auth(admin.token))).status).toBe(404);
});
