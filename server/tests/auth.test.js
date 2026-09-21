const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

test('login returns a token and never the password hash', async () => {
  const { user } = await createUser('cashier');
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toEqual(expect.any(String));
  expect(res.body.user.role).toBe('cashier');
  expect(res.body.user.passwordHash).toBeUndefined();
});

test('wrong password is rejected with 401', async () => {
  const { user } = await createUser('cashier');
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope' });
  expect(res.status).toBe(401);
});

test('deactivated user cannot log in', async () => {
  const { user } = await createUser('cashier', { active: false });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
  expect(res.status).toBe(401);
});

test('deactivated user is rejected even with a valid token', async () => {
  const { user, token } = await createUser('cashier');
  user.active = false;
  await user.save();
  const res = await request(app).get('/api/auth/me').set(auth(token));
  expect(res.status).toBe(401);
});

test('/me requires a token and returns the user', async () => {
  expect((await request(app).get('/api/auth/me')).status).toBe(401);
  const { token } = await createUser('accountant');
  const res = await request(app).get('/api/auth/me').set(auth(token));
  expect(res.status).toBe(200);
  expect(res.body.user.role).toBe('accountant');
});

test('login validates input', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
  expect(res.status).toBe(400);
  expect(res.body.fields.email).toBeDefined();
});
