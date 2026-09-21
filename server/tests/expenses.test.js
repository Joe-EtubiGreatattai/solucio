const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let accountant, cashier, account;
beforeEach(async () => {
  accountant = await createUser('accountant');
  cashier = await createUser('cashier');
  account = await makeAccount();
});
const body = (o = {}) => ({
  amount: 50000, date: '2026-01-15', accountId: account.id, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen', ...o,
});
const post = (token, o) => request(app).post('/api/expenses').set(auth(token)).send(body(o));

test('accountant records an expense', async () => {
  const res = await post(accountant.token, { note: 'Cylinders' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ amount: 50000, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen', note: 'Cylinders' });
});

test('leaf groups take no item and store null', async () => {
  const res = await post(accountant.token, { group: 'Staff Wages', item: undefined });
  expect(res.status).toBe(201);
  expect(res.body.item).toBeNull();
});

test('invalid category paths are rejected', async () => {
  for (const o of [
    { item: 'Nope' },
    { item: undefined },
    { group: 'Staff Wages', item: 'Bonus' },
    { type: 'Capital' },
    { type: 'Other' },
  ]) {
    const res = await post(accountant.token, o);
    expect(res.status).toBe(400);
    expect(res.body.fields.category).toBeDefined();
  }
});

test('cashiers cannot use expense routes', async () => {
  expect((await post(cashier.token)).status).toBe(403);
  expect((await request(app).get('/api/expenses').set(auth(cashier.token))).status).toBe(403);
});

test('list filters by type and group', async () => {
  await post(accountant.token);
  await post(accountant.token, { type: 'Capital', group: 'Equipment', item: 'Radiology' });
  const res = await request(app).get('/api/expenses?type=Capital').set(auth(accountant.token));
  expect(res.body.total).toBe(1);
  expect(res.body.items[0].item).toBe('Radiology');
  expect(res.body.items[0].account.name).toBe('Main Account');
});

test('void needs a reason, works once, and is audited', async () => {
  const created = await post(accountant.token);
  const url = `/api/expenses/${created.body._id}/void`;
  expect((await request(app).post(url).set(auth(accountant.token)).send({})).status).toBe(400);
  expect((await request(app).post(url).set(auth(accountant.token)).send({ reason: 'Duplicate' })).status).toBe(200);
  expect((await request(app).post(url).set(auth(accountant.token)).send({ reason: 'Again' })).status).toBe(409);
  expect((await AuditLog.find().sort('createdAt')).map((l) => l.action)).toEqual(['expense.create', 'expense.void']);
});

test('there is no way to edit or delete expenses', async () => {
  const created = await post(accountant.token);
  expect((await request(app).patch(`/api/expenses/${created.body._id}`).set(auth(accountant.token)).send({})).status).toBe(404);
  expect((await request(app).delete(`/api/expenses/${created.body._id}`).set(auth(accountant.token))).status).toBe(404);
});
