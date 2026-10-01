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

describe('changing your own password', () => {
  const AuditLog = require('../src/models/AuditLog');
  const change = (token, body) => request(app).post('/api/auth/password').set(auth(token)).send(body);
  const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

  test('anyone signed in can change their password with their current one', async () => {
    const { user, token } = await createUser('cashier');
    const res = await change(token, { currentPassword: 'password123', newPassword: 'a-much-better-one' });
    expect(res.status).toBe(200);
    expect((await login(user.email, 'password123')).status).toBe(401);
    expect((await login(user.email, 'a-much-better-one')).status).toBe(200);
    const log = await AuditLog.findOne({ action: 'user.password-change' }).lean();
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).not.toMatch(/a-much-better-one|password123/);
  });

  test('the current password must be right', async () => {
    const { user, token } = await createUser('cashier');
    const res = await change(token, { currentPassword: 'wrong-guess', newPassword: 'a-much-better-one' });
    expect(res.status).toBe(400);
    expect(res.body.fields.currentPassword).toBeDefined();
    expect((await login(user.email, 'password123')).status).toBe(200);
  });

  test('the new password must be at least 8 characters and different', async () => {
    const { token } = await createUser('cashier');
    expect((await change(token, { currentPassword: 'password123', newPassword: 'short' })).body.fields.newPassword).toBeDefined();
    expect((await change(token, { currentPassword: 'password123', newPassword: 'password123' })).body.fields.newPassword).toBeDefined();
  });

  test('needs a signed-in user', async () => {
    expect((await request(app).post('/api/auth/password').send({ currentPassword: 'x', newPassword: 'yyyyyyyy' })).status).toBe(401);
  });
});
