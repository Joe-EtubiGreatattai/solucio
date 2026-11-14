const request = require('supertest');
const app = require('../src/app');
const Expense = require('../src/models/Expense');
const Category = require('../src/models/Category');
const { ensureDefaultCategories } = require('../src/services/categories');

const KEY = 'test-payroll-key-0123456789abcdef';
const send = (body, key = KEY) => request(app).post('/api/integrations/payroll/expenses').set('x-integration-key', key).send(body);
const run = (o = {}) => ({
  ref: 'payroll-run-abc123', date: '2026-11-12',
  lines: [
    { kind: 'salaries', amount: 1_400_000, note: 'November 2026 salaries: 4 people' },
    { kind: 'paystack_fees', amount: 4_000, note: 'Paystack transfer fees: 4 transfers' },
  ],
  ...o,
});

beforeEach(async () => {
  process.env.PAYROLL_INTEGRATION_KEY = KEY;
  await ensureDefaultCategories();
});

test('off without a key, refused with the wrong key', async () => {
  process.env.PAYROLL_INTEGRATION_KEY = '';
  expect((await send(run())).status).toBe(503);
  process.env.PAYROLL_INTEGRATION_KEY = KEY;
  expect((await send(run(), 'wrong')).status).toBe(401);
});

test('records salaries and fees once, filed under Staff Wages and Bank Charges', async () => {
  const first = await send(run());
  expect(first.status).toBe(201);
  const again = await send(run());
  expect(again.status).toBe(201);
  expect(again.body.recorded.every((r) => r.existed)).toBe(true);

  const all = await Expense.find().lean();
  expect(all).toHaveLength(2);
  const salary = all.find((e) => e.group === 'Staff Wages');
  expect(salary).toMatchObject({ amount: 1_400_000, type: 'Recurrent', item: null, source: 'solucio-payroll' });
  const fee = all.find((e) => e.group === 'Bank Charges');
  expect(fee).toMatchObject({ amount: 4_000, item: 'Paystack fees' });

  const cat = await Category.findOne({ kind: 'expense', name: 'Recurrent' });
  const g = cat.groups.find((x) => x.name === 'Bank Charges');
  expect(g.items.map((i) => i.name)).toEqual(['Paystack fees', 'Stamp duty']);
});

test('rejects bad input', async () => {
  expect((await send(run({ lines: [{ kind: 'salaries', amount: 10.5, note: 'x' }] }))).status).toBe(400);
  expect((await send(run({ lines: [{ kind: 'bonus', amount: 100, note: 'x' }] }))).status).toBe(400);
  expect((await send(run({ ref: 'x' }))).status).toBe(400);
});
