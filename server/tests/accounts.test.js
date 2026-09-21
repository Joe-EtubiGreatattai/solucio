const request = require('supertest');
const app = require('../src/app');
const { createUser, auth, makeAccount } = require('./helpers');

test('admin creates a bank account with an opening balance', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({
    name: 'Ops', type: 'bank', bankName: 'Zenith', accountNumber: '1234567890', openingBalance: 500000,
  });
  expect(res.status).toBe(201);
  expect(res.body.openingBalance).toBe(500000);
  expect(res.body.active).toBe(true);
});

test('cash accounts need no bank details', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({ name: 'Petty cash', type: 'cash' });
  expect(res.status).toBe(201);
  expect(res.body.openingBalance).toBe(0);
});

test('bank accounts without bank name/number are rejected', async () => {
  const { token } = await createUser('admin');
  const res = await request(app).post('/api/accounts').set(auth(token)).send({ name: 'X', type: 'bank' });
  expect(res.status).toBe(400);
  expect(res.body.fields.bankName).toBeDefined();
});

test('non-admins cannot create accounts but can list them', async () => {
  const { token } = await createUser('cashier');
  await makeAccount();
  expect((await request(app).post('/api/accounts').set(auth(token)).send({ name: 'X', type: 'cash' })).status).toBe(403);
  const list = await request(app).get('/api/accounts').set(auth(token));
  expect(list.status).toBe(200);
  expect(list.body).toHaveLength(1);
});

test('?active=true hides deactivated accounts', async () => {
  const { token } = await createUser('cashier');
  await makeAccount({ name: 'A' });
  await makeAccount({ name: 'B', active: false });
  const res = await request(app).get('/api/accounts?active=true').set(auth(token));
  expect(res.body.map((a) => a.name)).toEqual(['A']);
});

test('admin can deactivate and edit, but type is immutable', async () => {
  const { token } = await createUser('admin');
  const acc = await makeAccount();
  const res = await request(app).patch(`/api/accounts/${acc.id}`).set(auth(token)).send({ active: false, name: 'Renamed', type: 'cash' });
  expect(res.status).toBe(200);
  expect(res.body.active).toBe(false);
  expect(res.body.name).toBe('Renamed');
  expect(res.body.type).toBe('bank');
});
