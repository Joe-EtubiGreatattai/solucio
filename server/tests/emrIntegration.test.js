const request = require('supertest');
const app = require('../src/app');
const Income = require('../src/models/Income');
const Account = require('../src/models/Account');
const { ensureDefaultCategories } = require('../src/services/categories');

const KEY = 'test-emr-key-0123456789abcdefgh';
const send = (body, key = KEY) => request(app).post('/api/integrations/emr/incomes').set('x-integration-key', key).send(body);
const pay = (o = {}) => ({ ref: 'emr:PAY-2026-00001', date: '2026-11-13', amount: 700000, method: 'cash', note: 'Ada Obi (SOL-000001) — visit V-2026-00001', ...o });

beforeEach(async () => {
  process.env.EMR_INTEGRATION_KEY = KEY;
  await ensureDefaultCategories();
  await Account.create({ name: 'Main account', type: 'bank', active: true });
});

test('off without a key, refused with the wrong key', async () => {
  process.env.EMR_INTEGRATION_KEY = '';
  expect((await send(pay())).status).toBe(503);
  process.env.EMR_INTEGRATION_KEY = KEY;
  expect((await send(pay(), 'wrong')).status).toBe(401);
});

test('records a patient payment as income with a receipt number, once', async () => {
  const first = await send(pay());
  expect(first.status).toBe(201);
  expect(first.body.receiptNumber).toMatch(/^RCP-2026-\d{4}$/);
  const again = await send(pay());
  expect(again.status).toBe(201);
  expect(again.body).toMatchObject({ receiptNumber: first.body.receiptNumber, existed: true });
  const all = await Income.find().lean();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ amount: 700000, method: 'cash', source: 'solucio-emr', externalRef: 'emr:PAY-2026-00001', type: 'Patient Services' });
  expect(all[0].note).toMatch(/Ada Obi/);
});

test('HMO claim payments are filed under HMO & Insurance', async () => {
  const r = await send(pay({ ref: 'emr:claim-abc123-1', kind: 'hmo_claim', method: 'transfer' }));
  expect(r.status).toBe(201);
  const inc = await Income.findOne({ externalRef: 'emr:claim-abc123-1' }).lean();
  expect(inc).toMatchObject({ type: 'HMO & Insurance', group: 'HMO Claims' });
});

test('bad input is refused', async () => {
  expect((await send(pay({ amount: -5 }))).status).toBe(400);
  expect((await send(pay({ method: 'cheque' }))).status).toBe(400);
});
