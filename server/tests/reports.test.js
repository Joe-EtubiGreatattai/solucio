const request = require('supertest');
const app = require('../src/app');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');

let accountant, account;
const get = (path) => request(app).get(`/api/reports${path}`).set(auth(accountant.token));
beforeEach(async () => {
  accountant = await createUser('accountant');
  account = await makeAccount({ openingBalance: 500000 });
});
const ctx = () => ({ account, recordedBy: accountant.user });

test('summary totals exclude voided entries', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-09-21T10:00:00Z' });
  await makeIncome({ ...ctx(), amount: 50000, date: '2026-09-21T10:00:00Z', voided: true });
  await makeExpense({ ...ctx(), amount: 30000, date: '2026-09-21T10:00:00Z' });
  const res = await get('/summary?from=2026-09-21&to=2026-09-21');
  expect(res.status).toBe(200);
  expect(res.body.income).toEqual({ total: 100000, count: 1 });
  expect(res.body.spending).toEqual({ total: 30000, count: 1 });
  expect(res.body.net).toBe(70000);
});

test('ranges follow the Lagos day boundary', async () => {
  await makeIncome({ ...ctx(), amount: 1, date: '2026-09-20T23:00:00Z' }); // 21st 00:00 Lagos: in
  await makeIncome({ ...ctx(), amount: 2, date: '2026-09-21T22:59:59.999Z' }); // 21st 23:59:59.999: in
  await makeIncome({ ...ctx(), amount: 4, date: '2026-09-20T22:59:59.999Z' }); // 20th: out
  await makeIncome({ ...ctx(), amount: 8, date: '2026-09-21T23:00:00Z' }); // 22nd: out
  const res = await get('/summary?from=2026-09-21&to=2026-09-21');
  expect(res.body.income).toEqual({ total: 3, count: 2 });
});

test('summary validates the range', async () => {
  expect((await get('/summary?from=2026-09-22&to=2026-09-21')).status).toBe(400);
  expect((await get('/summary?from=2026-09-22')).status).toBe(400);
});

test('spending by category follows the tree order and hides unused/void rows', async () => {
  const d = '2026-01-15T10:00:00Z';
  await makeExpense({ ...ctx(), amount: 30000, date: d, group: 'Hospital Consumables', item: 'Oxygen' });
  await makeExpense({ ...ctx(), amount: 10000, date: d, group: 'Hospital Consumables', item: 'Drugs' });
  await makeExpense({ ...ctx(), amount: 40000, date: d, group: 'Staff Wages' });
  await makeExpense({ ...ctx(), amount: 20000, date: d, type: 'Capital', group: 'Equipment', item: 'Radiology' });
  await makeExpense({ ...ctx(), amount: 99999, date: d, group: 'Rents', voided: true });
  const { body } = await get('/spending-by-category?from=2026-01-01&to=2026-01-31');
  expect(body.grandTotal).toBe(100000);
  expect(body.types.map((t) => [t.type, t.total, t.percent])).toEqual([['Recurrent', 80000, 80], ['Capital', 20000, 20]]);
  const recurrent = body.types[0];
  expect(recurrent.groups.map((g) => [g.group, g.total, g.percent])).toEqual([['Hospital Consumables', 40000, 40], ['Staff Wages', 40000, 40]]);
  expect(recurrent.groups[0].items.map((i) => [i.item, i.total, i.percent])).toEqual([['Oxygen', 30000, 30], ['Drugs', 10000, 10]]);
});

test('account balances = opening + income - expenses, voided ignored, inactive included', async () => {
  const other = await makeAccount({ name: 'Old', openingBalance: 1000, active: false });
  await makeIncome({ ...ctx(), amount: 200000 });
  await makeIncome({ ...ctx(), amount: 999, voided: true });
  await makeExpense({ ...ctx(), amount: 50000 });
  const { body } = await get('/account-balances');
  const main = body.accounts.find((a) => a.name === 'Main Account');
  expect(main).toMatchObject({ openingBalance: 500000, totalIn: 200000, totalOut: 50000, balance: 650000 });
  expect(body.accounts.find((a) => a.accountId === other.id).balance).toBe(1000);
  expect(body.grandTotal).toBe(651000);
});

test('account balances honour asOf', async () => {
  await makeIncome({ ...ctx(), amount: 200000, date: '2026-02-01T10:00:00Z' });
  const { body } = await get('/account-balances?asOf=2026-01-31');
  expect(body.accounts[0].balance).toBe(500000);
});

test('cashiers cannot read reports', async () => {
  const { token } = await createUser('cashier');
  expect((await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-02').set(auth(token))).status).toBe(403);
});

describe('spending by category after the categories change', () => {
  const Category = require('../src/models/Category');

  test('hidden categories still report the money already spent under them', async () => {
    const d = '2026-01-15T10:00:00Z';
    await makeExpense({ ...ctx(), amount: 20000, date: d, type: 'Capital', group: 'Equipment', item: 'Radiology' });
    await Category.updateOne({ name: 'Capital' }, { $set: { active: false } });
    const { body } = await get('/spending-by-category?from=2026-01-01&to=2026-01-31');
    expect(body.types.map((t) => [t.type, t.total])).toEqual([['Capital', 20000]]);
  });

  test('a leaf group that later gained items keeps its earlier untagged spending', async () => {
    const d = '2026-01-15T10:00:00Z';
    await makeExpense({ ...ctx(), amount: 40000, date: d, group: 'Staff Wages' });
    await Category.updateOne({ name: 'Recurrent' }, { $push: { 'groups.$[g].items': { name: 'Bonus' } } }, { arrayFilters: [{ 'g.name': 'Staff Wages' }] });
    await makeExpense({ ...ctx(), amount: 10000, date: d, group: 'Staff Wages', item: 'Bonus' });
    const { body } = await get('/spending-by-category?from=2026-01-01&to=2026-01-31');
    const wages = body.types[0].groups.find((g) => g.group === 'Staff Wages');
    expect(wages.total).toBe(50000);
    expect(wages.items.map((i) => [i.item, i.total])).toEqual([['Bonus', 10000], ['No item', 40000]]);
    expect(body.grandTotal).toBe(50000);
  });

  test('new categories show up in the report in the order the admin added them', async () => {
    const d = '2026-01-15T10:00:00Z';
    await Category.create({ name: 'Research', order: 2, groups: [{ name: 'Trials', items: [{ name: 'Phase 1' }] }] });
    await makeExpense({ ...ctx(), amount: 30000, date: d, type: 'Research', group: 'Trials', item: 'Phase 1' });
    await makeExpense({ ...ctx(), amount: 10000, date: d, group: 'Staff Wages' });
    const { body } = await get('/spending-by-category?from=2026-01-01&to=2026-01-31');
    expect(body.types.map((t) => t.type)).toEqual(['Recurrent', 'Research']);
    expect(body.types[1].groups[0].items[0]).toMatchObject({ item: 'Phase 1', total: 30000 });
  });
});
