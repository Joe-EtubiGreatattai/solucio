const request = require('supertest');
const app = require('../src/app');
const Statement = require('../src/models/Statement');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let admin;
let accountant;
let account;

beforeEach(async () => {
  admin = await createUser('admin');
  accountant = await createUser('accountant');
  account = await makeAccount();
});

async function makeStatement(confidence = 'needs-review') {
  return Statement.create({
    account: account._id,
    fileName: 'july-statement.pdf',
    uploadedBy: admin.user._id,
    transactions: [{
      date: new Date('2026-07-15T00:00:00Z'), narration: 'IBEDC PREPAID METER', amount: 975000,
      direction: 'expense', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence,
    }],
  });
}

test('lists statements for people with statement access', async () => {
  await makeStatement('high');
  const res = await request(app).get('/api/statements').set(auth(accountant.token));
  expect(res.status).toBe(200);
  expect(res.body[0]).toMatchObject({ fileName: 'july-statement.pdf', account: { name: 'Main Account' } });
});

test('a reviewer can correct a transaction and approval remains blocked until it is reviewed', async () => {
  const statement = await makeStatement();
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
  const statement = await makeStatement('high');
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
