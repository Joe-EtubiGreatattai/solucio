const request = require('supertest');
const app = require('../src/app');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');

let accountant, account;
const get = (query) => request(app).get(`/api/reports/cash-flow?${query}`).set(auth(accountant.token));
beforeEach(async () => {
  accountant = await createUser('accountant');
  account = await makeAccount({ openingBalance: 500000 });
});
const ctx = () => ({ account, recordedBy: accountant.user });

test('is gated by reports.view like the rest of Reports', async () => {
  const cashier = await createUser('cashier');
  const res = await request(app).get('/api/reports/cash-flow?from=2026-01-01&to=2026-01-05').set(auth(cashier.token));
  expect(res.status).toBe(403);
});

test('validates the range', async () => {
  expect((await get('from=2026-01-05&to=2026-01-01')).status).toBe(400);
  expect((await get('from=2026-01-01')).status).toBe(400);
});

test('totals match summary and exclude voided entries', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-01-02T10:00:00Z' });
  await makeIncome({ ...ctx(), amount: 40000, date: '2026-01-02T10:00:00Z', voided: true });
  await makeExpense({ ...ctx(), amount: 30000, date: '2026-01-03T10:00:00Z' });
  const res = await get('from=2026-01-01&to=2026-01-05');
  expect(res.status).toBe(200);
  expect(res.body.totals).toMatchObject({ income: 100000, expenses: 30000, net: 70000 });
});

test('daily series covers every day in a short range, in order, with correct per-day totals', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-01-01T10:00:00Z' });
  await makeExpense({ ...ctx(), amount: 20000, date: '2026-01-01T12:00:00Z' });
  await makeIncome({ ...ctx(), amount: 50000, date: '2026-01-03T10:00:00Z' });
  const res = await get('from=2026-01-01&to=2026-01-03');
  expect(res.body.bucket).toBe('day');
  expect(res.body.series.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  expect(res.body.series[0]).toMatchObject({ income: 100000, expenses: 20000, net: 80000 });
  expect(res.body.series[1]).toMatchObject({ income: 0, expenses: 0, net: 0 });
  expect(res.body.series[2]).toMatchObject({ income: 50000, expenses: 0, net: 50000 });
});

test('cumulative starts from the account balance just before the range and carries forward', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-01-01T10:00:00Z' });
  await makeExpense({ ...ctx(), amount: 30000, date: '2026-01-02T10:00:00Z' });
  const res = await get('from=2026-01-01&to=2026-01-02');
  expect(res.body.series[0].cumulative).toBe(600000); // 500000 opening + 100000
  expect(res.body.series[1].cumulative).toBe(570000); // -30000
});

test('bucket switches to week then month as the range grows', async () => {
  const week = await get('from=2026-01-01&to=2026-02-15'); // 46 days
  expect(week.body.bucket).toBe('week');
  const month = await get('from=2026-01-01&to=2026-12-31'); // 365 days
  expect(month.body.bucket).toBe('month');
  const monthLabels = month.body.series.map((s) => s.date);
  expect(monthLabels).toEqual([...new Set(monthLabels)]); // no duplicate months
  expect(monthLabels[0]).toBe('2026-01');
});

test('compares against the immediately preceding period of equal length, with % change', async () => {
  await makeIncome({ ...ctx(), amount: 100000, date: '2026-02-01T10:00:00Z' }); // in range
  await makeIncome({ ...ctx(), amount: 50000, date: '2026-01-30T10:00:00Z' }); // previous period (5 days before: Jan 27-31)
  const res = await get('from=2026-02-01&to=2026-02-05');
  expect(res.body.previous.income).toBe(50000);
  expect(res.body.change.income).toBe(100); // doubled
});

test('a previous period of zero is reported as null (new), not divide-by-zero', async () => {
  await makeIncome({ ...ctx(), amount: 10000, date: '2026-06-10T10:00:00Z' });
  const res = await get('from=2026-06-10&to=2026-06-10');
  expect(res.body.previous.income).toBe(0);
  expect(res.body.change.income).toBeNull();
});

test('burn rate: negative net gives a runway in days; positive net gives none', async () => {
  await makeExpense({ ...ctx(), amount: 100000, date: '2026-03-01T10:00:00Z' });
  await makeExpense({ ...ctx(), amount: 100000, date: '2026-03-02T10:00:00Z' });
  const losing = await get('from=2026-03-01&to=2026-03-02'); // -200000 over 2 days = -100000/day
  expect(losing.body.burnRate.avgDailyNet).toBe(-100000);
  // Cash on hand as of "to" already reflects that period's spending: 500000 opening - 200000 spent = 300000.
  expect(losing.body.burnRate.runwayDays).toBe(3);

  await makeIncome({ ...ctx(), amount: 900000, date: '2026-03-05T10:00:00Z' });
  const healthy = await get('from=2026-03-05&to=2026-03-05');
  expect(healthy.body.burnRate.runwayDays).toBeNull();
});

test('top outflows lists the biggest expense groups, highest first, capped at 5', async () => {
  await makeExpense({ ...ctx(), amount: 90000, date: '2026-04-01T10:00:00Z', type: 'Recurrent', group: 'Staff Wages' });
  await makeExpense({ ...ctx(), amount: 50000, date: '2026-04-01T10:00:00Z', type: 'Recurrent', group: 'Rents' });
  await makeExpense({ ...ctx(), amount: 10000, date: '2026-04-01T10:00:00Z', type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' });
  const res = await get('from=2026-04-01&to=2026-04-01');
  expect(res.body.topOutflows.length).toBeGreaterThanOrEqual(3);
  expect(res.body.topOutflows[0]).toMatchObject({ group: 'Staff Wages', total: 90000 });
  expect(res.body.topOutflows[1]).toMatchObject({ group: 'Rents', total: 50000 });
  expect(res.body.topOutflows.length).toBeLessThanOrEqual(5);
});

test('income by method breaks down transfer vs pos with percentages', async () => {
  await makeIncome({ ...ctx(), amount: 75000, date: '2026-05-01T10:00:00Z', method: 'transfer' });
  await makeIncome({ ...ctx(), amount: 25000, date: '2026-05-01T10:00:00Z', method: 'pos' });
  const res = await get('from=2026-05-01&to=2026-05-01');
  const byMethod = Object.fromEntries(res.body.incomeByMethod.map((m) => [m.method, m]));
  expect(byMethod.transfer).toMatchObject({ total: 75000, percent: 75 });
  expect(byMethod.pos).toMatchObject({ total: 25000, percent: 25 });
});
