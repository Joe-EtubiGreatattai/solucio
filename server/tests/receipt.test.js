const request = require('supertest');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const app = require('../src/app');
const { createUser, auth, makeAccount } = require('./helpers');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const getPdf = (token, id) => request(app).get(`/api/incomes/${id}/receipt`).set(auth(token)).buffer(true).parse(binary);

let cashier, income;
beforeEach(async () => {
  cashier = await createUser('cashier');
  const account = await makeAccount();
  const res = await request(app).post('/api/incomes').set(auth(cashier.token))
    .send({ amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id });
  income = res.body;
});

test('receipt PDF has the receipt details and no VOID mark', async () => {
  const res = await getPdf(cashier.token, income._id);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('application/pdf');
  expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  const { text } = await pdfParse(res.body);
  expect(text).toContain('Test Hospital');
  expect(text).toContain('RCP-2026-0001');
  expect(text).toContain('15/01/2026');
  expect(text).toContain('NGN 1,500.00');
  expect(text).toContain('One thousand five hundred naira only');
  expect(text).toContain('Bank transfer');
  expect(text).toContain('6789');
  expect(text).toContain(cashier.user.name);
  expect(text).not.toContain('VOID');
});

test('voided receipt carries VOID and the reason', async () => {
  await request(app).post(`/api/incomes/${income._id}/void`).set(auth(cashier.token)).send({ reason: 'Wrong amount' });
  const res = await getPdf(cashier.token, income._id);
  const { text } = await pdfParse(res.body);
  expect(text).toContain('VOID');
  expect(text).toContain('Wrong amount');
  expect(text).toContain('RCP-2026-0001');
});

test('unknown receipt is 404', async () => {
  const res = await request(app).get('/api/incomes/64b7f0000000000000000000/receipt').set(auth(cashier.token));
  expect(res.status).toBe(404);
});
