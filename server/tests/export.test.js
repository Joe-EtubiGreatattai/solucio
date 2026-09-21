const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../src/app');
const { createUser, auth, makeAccount, makeIncome, makeExpense } = require('./helpers');
const { pdfText } = require('./pdfText');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
let accountant, ctx;
const exportReq = (q) => request(app).get(`/api/reports/export?${q}`).set(auth(accountant.token)).buffer(true).parse(binary);

beforeEach(async () => {
  accountant = await createUser('accountant');
  ctx = { account: await makeAccount(), recordedBy: accountant.user };
  await makeIncome({ ...ctx, amount: 150000, receiptNumber: 'RCP-A' });
  await makeIncome({ ...ctx, amount: 99900, voided: true, voidReason: 'Wrong', receiptNumber: 'RCP-B' });
  await makeExpense({ ...ctx, amount: 25050, group: 'Hospital Consumables', item: 'Oxygen' });
});

test('income xlsx lists voided rows but totals exclude them', async () => {
  const res = await exportReq('type=income&format=xlsx&from=2026-01-01&to=2026-01-31');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('spreadsheetml');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws = wb.worksheets[0];
  expect(ws.getRow(4).getCell(2).value).toBe('Receipt No.');
  const receipts = [5, 6].map((r) => ws.getRow(r).getCell(2).value);
  expect(receipts).toEqual(['RCP-A', 'RCP-B']);
  expect(ws.getRow(6).getCell(6).value).toBe('VOID: Wrong');
  expect(ws.getRow(7).getCell(1).value).toBe('Total (excluding void)');
  expect(ws.getRow(7).getCell(5).value).toBe(1500);
});

test('expenses xlsx shows the category path', async () => {
  const res = await exportReq('type=expenses&format=xlsx&from=2026-01-01&to=2026-01-31');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  expect(wb.worksheets[0].getRow(5).getCell(2).value).toBe('Recurrent > Hospital Consumables > Oxygen');
});

test('summary xlsx has income, spending and net', async () => {
  const res = await exportReq('type=summary&format=xlsx&from=2026-01-01&to=2026-01-31');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws = wb.worksheets[0];
  expect([5, 6, 7].map((r) => [ws.getRow(r).getCell(1).value, ws.getRow(r).getCell(2).value])).toEqual([
    ['Total income', 1500], ['Total spending', 250.5], ['Net', 1249.5],
  ]);
});

test('pdf export contains the title and rows', async () => {
  const res = await exportReq('type=income&format=pdf&from=2026-01-01&to=2026-01-31');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch('application/pdf');
  const text = await pdfText(res.body);
  expect(text).toContain('Income');
  expect(text).toContain('RCP-A');
  expect(text).toContain('1,500.00');
});

test('export validates params', async () => {
  expect((await exportReq('type=bogus&format=xlsx&from=2026-01-01&to=2026-01-31')).status).toBe(400);
  expect((await exportReq('type=income&format=csv&from=2026-01-01&to=2026-01-31')).status).toBe(400);
});
