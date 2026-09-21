const request = require('supertest');
const app = require('../src/app');
const Role = require('../src/models/Role');
const { PERMISSION_KEYS } = require('../src/config/permissions');
const { createUser, auth, makeAccount, makeRole } = require('./helpers');

const range = 'from=2026-01-01&to=2026-01-31';
const status = (token, method, path, body) => request(app)[method](path).set(auth(token)).send(body || {}).then((r) => r.status);
const allowed = (s) => ![401, 403].includes(s);

async function userWith(permissions, key = 'clerk') {
  await makeRole(key, permissions);
  return createUser(key);
}

describe('routes check the permission, not the role name', () => {
  test('view income without record or void', async () => {
    const { token } = await userWith(['income.view']);
    expect(allowed(await status(token, 'get', '/api/incomes'))).toBe(true);
    expect(await status(token, 'post', '/api/incomes')).toBe(403);
    expect(await status(token, 'post', '/api/incomes/64b7f0000000000000000000/void')).toBe(403);
    expect(await status(token, 'get', '/api/expenses')).toBe(403);
  });

  test('record income without view', async () => {
    const { token } = await userWith(['income.record']);
    expect(allowed(await status(token, 'post', '/api/incomes'))).toBe(true);
    expect(await status(token, 'get', '/api/incomes')).toBe(403);
    expect(await status(token, 'get', '/api/incomes/64b7f0000000000000000000/receipt')).toBe(403);
  });

  test('expenses have their own view, record and void permissions', async () => {
    const view = await userWith(['expenses.view'], 'viewer');
    const record = await userWith(['expenses.record'], 'recorder');
    const voider = await userWith(['expenses.void'], 'voider');
    expect(allowed(await status(view.token, 'get', '/api/expenses'))).toBe(true);
    expect(await status(view.token, 'post', '/api/expenses')).toBe(403);
    expect(allowed(await status(record.token, 'post', '/api/expenses'))).toBe(true);
    expect(await status(record.token, 'get', '/api/expenses')).toBe(403);
    expect(allowed(await status(voider.token, 'post', '/api/expenses/64b7f0000000000000000000/void'))).toBe(true);
    expect(await status(voider.token, 'post', '/api/expenses')).toBe(403);
  });

  test('reports.view reads reports but exporting needs reports.export as well', async () => {
    const viewer = await userWith(['reports.view'], 'viewer');
    const exporter = await userWith(['reports.view', 'reports.export'], 'exporter');
    expect(await status(viewer.token, 'get', `/api/reports/summary?${range}`)).toBe(200);
    expect(await status(viewer.token, 'get', `/api/reports/export?type=summary&format=xlsx&${range}`)).toBe(403);
    expect(await status(exporter.token, 'get', `/api/reports/export?type=summary&format=xlsx&${range}`)).toBe(200);
  });

  test('activity.view opens the log and accounts.manage opens account changes', async () => {
    const { token } = await userWith(['activity.view']);
    expect(await status(token, 'get', '/api/audit-logs')).toBe(200);
    expect(await status(token, 'post', '/api/accounts', { name: 'X', type: 'cash' })).toBe(403);
    const manager = await userWith(['accounts.manage'], 'banker');
    expect(await status(manager.token, 'post', '/api/accounts', { name: 'X', type: 'cash' })).toBe(201);
    expect(await status(manager.token, 'get', '/api/audit-logs')).toBe(403);
  });

  test('everyone signed in can still list accounts and categories', async () => {
    const { token } = await userWith([]);
    expect(await status(token, 'get', '/api/accounts')).toBe(200);
    expect(await status(token, 'get', '/api/categories')).toBe(200);
  });
});

describe('changes take effect straight away', () => {
  test('editing a role changes what the same token can do on the next request', async () => {
    const { token } = await userWith(['income.view']);
    expect(await status(token, 'get', '/api/incomes')).toBe(200);
    await Role.updateOne({ key: 'clerk' }, { $set: { permissions: [] } });
    expect(await status(token, 'get', '/api/incomes')).toBe(403);
  });

  test('a user whose role no longer exists can sign in but can do nothing', async () => {
    const { user, token } = await createUser('cashier');
    await Role.deleteOne({ key: 'cashier' });
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.permissions).toEqual([]);
    expect(await status(token, 'get', '/api/incomes')).toBe(403);
    expect(user.role).toBe('cashier');
  });

  test('Admin always has everything, even if its stored permissions are emptied', async () => {
    const { token } = await createUser('admin');
    await Role.updateOne({ key: 'admin' }, { $set: { permissions: [] } });
    expect(await status(token, 'get', '/api/users')).toBe(200);
    expect(await status(token, 'get', '/api/audit-logs')).toBe(200);
  });
});

describe('sign-in and /me tell the client what the person may do', () => {
  test('login returns the role name and permissions', async () => {
    const { user } = await userWith(['income.view', 'income.record'], 'front-desk');
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.roleName).toBe('Front Desk');
    expect(res.body.permissions.sort()).toEqual(['income.record', 'income.view']);
  });

  test('/me for an admin lists every permission', async () => {
    const { token } = await createUser('admin');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.roleName).toBe('Admin');
    expect([...me.body.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  test('a cashier keeps exactly the built-in cashier access', async () => {
    const { token } = await createUser('cashier');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.permissions.sort()).toEqual(['income.record', 'income.view', 'income.void']);
    expect((await makeAccount()).id).toBeTruthy();
  });
});
