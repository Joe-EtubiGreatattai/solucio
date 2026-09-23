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
  expect(ws.getRow(4).getCell(5).value).toBe('Amount (₦)');
  expect(ws.getRow(2).getCell(1).value).toBe('01/01/2026 to 31/01/2026');
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

test('summary export still needs a date range', async () => {
  expect((await exportReq('type=summary&format=xlsx')).status).toBe(400);
});

describe('exporting with the filters shown on the Income/Expenses pages', () => {
  test('income export honours status, method and account', async () => {
    const other = await makeAccount({ name: 'Second Account' });
    await makeIncome({ ...ctx, amount: 30000, method: 'pos', receiptNumber: 'RCP-C' });
    await makeIncome({ ...ctx, account: other, amount: 40000, method: 'transfer', receiptNumber: 'RCP-D' });

    const activeOnly = await exportReq('type=income&format=xlsx&status=active');
    let wb = new ExcelJS.Workbook();
    await wb.xlsx.load(activeOnly.body);
    let ws = wb.worksheets[0];
    expect([5, 6, 7].map((r) => ws.getRow(r).getCell(2).value)).toEqual(['RCP-A', 'RCP-C', 'RCP-D']);

    const posOnly = await exportReq('type=income&format=xlsx&method=pos');
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(posOnly.body);
    ws = wb.worksheets[0];
    expect(ws.getRow(5).getCell(2).value).toBe('RCP-C');

    const byAccount = await exportReq(`type=income&format=xlsx&accountId=${other._id}`);
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(byAccount.body);
    ws = wb.worksheets[0];
    expect(ws.getRow(5).getCell(2).value).toBe('RCP-D');
  });

  test('expenses export honours category type, group and item', async () => {
    await makeExpense({ ...ctx, amount: 5000, type: 'One-off', group: 'Equipment', item: null, note: 'A' });

    const res = await exportReq('type=expenses&format=xlsx&categoryType=Recurrent&group=Hospital%20Consumables&item=Oxygen');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    expect(ws.getRow(5).getCell(2).value).toBe('Recurrent > Hospital Consumables > Oxygen');
    expect(ws.rowCount).toBe(6); // header rows + one matching row + total
  });

  test('income and expense exports fall back to "All dates" when no range is given', async () => {
    const res = await exportReq('type=income&format=xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets[0].getRow(2).getCell(1).value).toBe('All dates');
  });

  test('a cashier can export income but not expenses or the summary', async () => {
    const cashier = await createUser('cashier');
    const asCashier = (q) => request(app).get(`/api/reports/export?${q}`).set(auth(cashier.token)).buffer(true).parse(binary);
    expect((await asCashier('type=income&format=xlsx&from=2026-01-01&to=2026-01-31')).status).toBe(200);
    expect((await asCashier('type=expenses&format=xlsx&from=2026-01-01&to=2026-01-31')).status).toBe(403);
    expect((await asCashier('type=summary&format=xlsx&from=2026-01-01&to=2026-01-31')).status).toBe(403);
  });
});
