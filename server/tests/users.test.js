const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

let admin;
beforeEach(async () => { admin = await createUser('admin'); });
const create = (o = {}) =>
  request(app).post('/api/users').set(auth(admin.token)).send({ name: 'Ada', email: 'ada@test.com', password: 'password123', role: 'cashier', ...o });

test('admin creates a user who can then log in', async () => {
  const res = await create();
  expect(res.status).toBe(201);
  expect(res.body.passwordHash).toBeUndefined();
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@test.com', password: 'password123' });
  expect(login.status).toBe(200);
});

test('duplicate email is 409 and short passwords are 400', async () => {
  await create();
  expect((await create()).status).toBe(409);
  const res = await create({ email: 'b@test.com', password: 'short' });
  expect(res.status).toBe(400);
  expect(res.body.fields.password).toBeDefined();
});

test('list never leaks password hashes', async () => {
  await create();
  const res = await request(app).get('/api/users').set(auth(admin.token));
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(1);
  expect(res.body.every((u) => u.passwordHash === undefined)).toBe(true);
});

test('admin changes role, deactivates, and resets password', async () => {
  const { body } = await create();
  const res = await request(app).patch(`/api/users/${body._id}`).set(auth(admin.token)).send({ role: 'accountant', active: false, password: 'newpassword1' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ role: 'accountant', active: false });
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@test.com', password: 'newpassword1' });
  expect(login.status).toBe(401); // inactive
});

test('admin cannot demote or deactivate themselves', async () => {
  const a = await request(app).patch(`/api/users/${admin.user.id}`).set(auth(admin.token)).send({ role: 'cashier' });
  const b = await request(app).patch(`/api/users/${admin.user.id}`).set(auth(admin.token)).send({ active: false });
  expect([a.status, b.status]).toEqual([400, 400]);
});
