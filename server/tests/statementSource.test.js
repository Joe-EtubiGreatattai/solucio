// The raw PDF lives in its own collection, not inline on the statement, so the statement stays small and
// fast to read/re-save during review. These tests cover: a new import stores the PDF out of band, the
// one-time migration moves legacy inline PDFs, and deleting a statement cleans up its stored PDF.
jest.mock('../src/services/statementParser');

const request = require('supertest');
const mongoose = require('mongoose');
const { extractTransactions } = require('../src/services/statementParser');
const app = require('../src/app');
const Statement = require('../src/models/Statement');
const StatementSource = require('../src/models/StatementSource');
const { migrateStatementSources } = require('../src/services/statementSource');
const { createUser, auth, makeAccount } = require('./helpers');

let admin;
let account;

beforeEach(async () => {
  admin = await createUser('admin');
  account = await makeAccount();
  extractTransactions.mockResolvedValue({
    accountName: 'Main Account',
    pageCount: 1,
    transactions: [{
      date: new Date('2026-07-15T00:00:00Z'), narration: 'IBEDC PREPAID METER', amount: 975000,
      reference: 'REF1', direction: 'expense',
    }],
  });
});

const pdf = Buffer.from('%PDF-1.4 fake bytes for the test');

test('importing stores the PDF out of band, not inline on the statement', async () => {
  const res = await request(app)
    .post(`/api/statements/import?accountId=${account.id}&fileName=july.pdf`)
    .set(auth(admin.token))
    .set('Content-Type', 'application/pdf')
    .send(pdf);
  expect(res.status).toBe(201);

  // The statement the route returns carries no PDF bytes...
  expect(res.body.sourcePdf).toBeUndefined();
  // ...and the raw document in the collection has no sourcePdf field at all.
  const raw = await mongoose.connection.db.collection('statements').findOne({ _id: new mongoose.Types.ObjectId(res.body._id) });
  expect(raw.sourcePdf).toBeUndefined();

  // The PDF is kept in its own collection, keyed to the statement.
  const source = await StatementSource.findOne({ statement: res.body._id });
  expect(source).toBeTruthy();
  expect(Buffer.compare(source.data, pdf)).toBe(0);
});

test('the migration moves a legacy inline sourcePdf into its own collection and shrinks the statement', async () => {
  // Simulate an old statement that still stores the PDF inline.
  const statement = await Statement.create({
    account: account._id, fileName: 'legacy.pdf', uploadedBy: admin.user._id,
    transactions: [{ date: new Date('2026-07-15T00:00:00Z'), narration: 'OLD', amount: 1000, direction: 'expense' }],
  });
  await mongoose.connection.db.collection('statements').updateOne({ _id: statement._id }, { $set: { sourcePdf: pdf, mimeType: 'application/pdf' } });

  const { moved } = await migrateStatementSources();
  expect(moved).toBe(1);

  const raw = await mongoose.connection.db.collection('statements').findOne({ _id: statement._id });
  expect(raw.sourcePdf).toBeUndefined();
  const source = await StatementSource.findOne({ statement: statement._id });
  expect(Buffer.compare(source.data, pdf)).toBe(0);

  // Running it again is a no-op (nothing left to move).
  expect((await migrateStatementSources()).moved).toBe(0);
});

test('deleting a statement in review also removes its stored PDF', async () => {
  const create = await request(app)
    .post(`/api/statements/import?accountId=${account.id}&fileName=july.pdf`)
    .set(auth(admin.token)).set('Content-Type', 'application/pdf').send(pdf);
  const id = create.body._id;
  expect(await StatementSource.findOne({ statement: id })).toBeTruthy();

  const del = await request(app).delete(`/api/statements/${id}`).set(auth(admin.token));
  expect(del.status).toBe(200);
  expect(await StatementSource.findOne({ statement: id })).toBeNull();
});
