const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { PERMISSION_KEYS } = require('../src/config/permissions');
const { createUser, auth, makeRole } = require('./helpers');

let admin;
beforeEach(async () => { admin = await createUser('admin'); });
const create = (token, o = {}) =>
  request(app).post('/api/users').set(auth(token)).send({ name: 'Ada', email: 'ada@test.com', password: 'password123', role: 'cashier', ...o });
const patch = (token, id, body) => request(app).patch(`/api/users/${id}`).set(auth(token)).send(body);

test('a user can only be given a role that exists', async () => {
  const res = await create(admin.token, { role: 'ghost' });
  expect(res.status).toBe(400);
  expect(res.body.fields.role).toBeDefined();
  const ok = await create(admin.token, { role: 'accountant' });
  expect(ok.status).toBe(201);
  expect((await patch(admin.token, ok.body._id, { role: 'ghost' })).status).toBe(400);
});

test('custom roles can be assigned, and role keys are case-insensitive', async () => {
  await makeRole('front-desk', ['income.view']);
  const made = await create(admin.token, { role: 'Front-Desk' });
  expect(made.status).toBe(201);
  expect(made.body.role).toBe('front-desk');
  const other = await create(admin.token, { email: 'b@test.com', role: 'cashier' });
  expect((await patch(admin.token, other.body._id, { role: 'front-desk' })).body.role).toBe('front-desk');
});

test('an admin can create another admin, who then has every permission', async () => {
  const made = await create(admin.token, { email: 'boss@test.com', role: 'admin' });
  expect(made.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email: 'boss@test.com', password: 'password123' });
  expect(login.status).toBe(200);
  expect([...login.body.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
});

describe('a role with users.manage is a delegate, not an admin', () => {
  let hr;
  beforeEach(async () => {
    await makeRole('hr', ['users.manage']);
    hr = await createUser('hr');
  });

  test('can add and re-role ordinary users', async () => {
    const made = await create(hr.token, { role: 'cashier' });
    expect(made.status).toBe(201);
    expect((await patch(hr.token, made.body._id, { role: 'accountant' })).status).toBe(200);
  });

  test('cannot create an admin or promote anyone to admin', async () => {
    expect((await create(hr.token, { role: 'admin' })).status).toBe(403);
    const made = await create(hr.token, { email: 'c@test.com', role: 'cashier' });
    expect((await patch(hr.token, made.body._id, { role: 'admin' })).status).toBe(403);
    expect((await User.findById(made.body._id)).role).toBe('cashier');
  });

  test('cannot change, deactivate or reset the password of an admin', async () => {
    for (const body of [{ name: 'Hacked' }, { active: false }, { role: 'cashier' }, { password: 'newpassword1' }]) {
      expect((await patch(hr.token, admin.user.id, body)).status).toBe(403);
    }
    expect((await User.findById(admin.user.id)).active).toBe(true);
  });
});

test('a missing user is 404', async () => {
  expect((await patch(admin.token, '64b7f0000000000000000000', { name: 'X' })).status).toBe(404);
});
