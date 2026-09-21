const request = require('supertest');
const app = require('../src/app');
const Role = require('../src/models/Role');
const AuditLog = require('../src/models/AuditLog');
const { PERMISSION_KEYS } = require('../src/config/permissions');
const { createUser, auth, makeRole } = require('./helpers');

let admin;
beforeEach(async () => { admin = await createUser('admin'); });
const post = (token, body) => request(app).post('/api/roles').set(auth(token)).send(body);
const patch = (token, key, body) => request(app).patch(`/api/roles/${key}`).set(auth(token)).send(body);

describe('GET /api/roles', () => {
  test('lists the roles with how many users hold each, plus the permission catalogue', async () => {
    await createUser('cashier');
    await createUser('cashier');
    const res = await request(app).get('/api/roles').set(auth(admin.token));
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.roles.map((r) => [r.key, r]));
    expect(Object.keys(byKey).sort()).toEqual(['accountant', 'admin', 'cashier']);
    expect(byKey.cashier).toMatchObject({ name: 'Cashier', builtIn: true, userCount: 2 });
    expect(byKey.admin.permissions.sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(res.body.permissions.map((p) => p.key)).toEqual(PERMISSION_KEYS);
    expect(res.body.permissions[0]).toMatchObject({ label: expect.any(String), group: expect.any(String) });
  });

  test('is open to anyone who can manage users, and to nobody else', async () => {
    await makeRole('hr', ['users.manage']);
    const hr = await createUser('hr');
    expect((await request(app).get('/api/roles').set(auth(hr.token))).status).toBe(200);
    const cashier = await createUser('cashier');
    expect((await request(app).get('/api/roles').set(auth(cashier.token))).status).toBe(403);
  });
});

describe('POST /api/roles', () => {
  test('admin creates a role and it is audited', async () => {
    const res = await post(admin.token, { name: 'Front Desk', description: 'Reception', permissions: ['income.view', 'income.record'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'front-desk', name: 'Front Desk', description: 'Reception', builtIn: false });
    expect(res.body.permissions.sort()).toEqual(['income.record', 'income.view']);
    const log = await AuditLog.findOne({ action: 'role.create' });
    expect(log.details).toMatchObject({ name: 'Front Desk', permissions: ['income.view', 'income.record'] });
  });

  test('names must be unique ignoring case, and keys stay unique too', async () => {
    expect((await post(admin.token, { name: 'Front Desk', permissions: [] })).status).toBe(201);
    expect((await post(admin.token, { name: 'front desk', permissions: [] })).status).toBe(409);
    expect((await post(admin.token, { name: 'ADMIN', permissions: [] })).status).toBe(409);
    const second = await post(admin.token, { name: 'Front-Desk', permissions: [] });
    expect(second.status).toBe(201);
    expect(second.body.key).toBe('front-desk-2');
  });

  test('validates the name and the permissions', async () => {
    expect((await post(admin.token, { name: '  ', permissions: [] })).body.fields.name).toBeDefined();
    expect((await post(admin.token, { name: 'X'.repeat(41), permissions: [] })).status).toBe(400);
    const bad = await post(admin.token, { name: 'Clerk', permissions: ['made.up'] });
    expect(bad.status).toBe(400);
    expect(bad.body.fields['permissions.0']).toBeDefined();
  });

  test('only the built-in Admin role can create roles, even with users.manage', async () => {
    await makeRole('hr', ['users.manage']);
    const hr = await createUser('hr');
    expect((await post(hr.token, { name: 'Sneaky', permissions: [] })).status).toBe(403);
    expect(await Role.countDocuments({ key: 'sneaky' })).toBe(0);
  });
});

describe('PATCH /api/roles/:key', () => {
  test('changes permissions, name and description, and it applies at once', async () => {
    await makeRole('clerk', ['income.view']);
    const clerk = await createUser('clerk');
    const denied = await request(app).post('/api/incomes').set(auth(clerk.token)).send({});
    expect(denied.status).toBe(403);
    const res = await patch(admin.token, 'clerk', { name: 'Records clerk', description: 'Enters payments', permissions: ['income.view', 'income.record'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: 'clerk', name: 'Records clerk', description: 'Enters payments' });
    const now = await request(app).post('/api/incomes').set(auth(clerk.token)).send({});
    expect(now.status).toBe(400); // allowed through the permission check, rejected by validation
    const log = await AuditLog.findOne({ action: 'role.update' });
    expect(log.details).toMatchObject({ name: 'Records clerk', changes: { permissions: ['income.view', 'income.record'] } });
  });

  test('the built-in Cashier and Accountant roles can be edited', async () => {
    const res = await patch(admin.token, 'cashier', { permissions: ['income.view'] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(['income.view']);
  });

  test('the Admin role cannot be changed', async () => {
    const res = await patch(admin.token, 'admin', { permissions: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Admin role cannot be changed/);
    expect(await Role.findOne({ key: 'admin' })).toMatchObject({ permissions: expect.arrayContaining(PERMISSION_KEYS) });
  });

  test('missing roles are 404, duplicate names 409, and non-admins are refused', async () => {
    expect((await patch(admin.token, 'nope', { name: 'X' })).status).toBe(404);
    await makeRole('clerk', []);
    expect((await patch(admin.token, 'clerk', { name: 'cashier' })).status).toBe(409);
    await makeRole('hr', ['users.manage']);
    const hr = await createUser('hr');
    expect((await patch(hr.token, 'clerk', { permissions: ['income.view'] })).status).toBe(403);
  });
});

describe('DELETE /api/roles/:key', () => {
  const del = (token, key) => request(app).delete(`/api/roles/${key}`).set(auth(token));

  test('removes an unused custom role and audits it', async () => {
    await makeRole('temp', []);
    expect((await del(admin.token, 'temp')).status).toBe(200);
    expect(await Role.countDocuments({ key: 'temp' })).toBe(0);
    expect((await AuditLog.findOne({ action: 'role.delete' })).details).toMatchObject({ name: 'Temp' });
  });

  test('refuses while users still hold the role, and for built-in roles', async () => {
    await makeRole('temp', []);
    await createUser('temp');
    const inUse = await del(admin.token, 'temp');
    expect(inUse.status).toBe(409);
    expect(inUse.body.message).toMatch(/1 user/);
    expect((await del(admin.token, 'cashier')).status).toBe(400);
    expect((await del(admin.token, 'admin')).status).toBe(400);
    expect((await del(admin.token, 'ghost')).status).toBe(404);
  });
});
