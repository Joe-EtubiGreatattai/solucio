const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const app = require('../src/app');
const Role = require('../src/models/Role');
const { initRealtime, closeRealtime } = require('../src/realtime');
const { createUser, auth, makeAccount, makeRole } = require('./helpers');

let server;
let base;
const open = [];

beforeAll(async () => {
  server = http.createServer(app);
  initRealtime(server, { origins: ['http://localhost:5173'] });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});
afterEach(() => { while (open.length) open.pop().disconnect(); });
afterAll(async () => { await closeRealtime(); });

// A connected socket that remembers every event it receives.
function listen(token) {
  return new Promise((resolve, reject) => {
    const socket = connect(base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.events = [];
    socket.on('data:changed', (e) => socket.events.push(e));
    socket.on('access:changed', () => socket.events.push({ resource: '(access)', action: 'changed' }));
    socket.on('access:revoked', () => { socket.revoked = true; });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => { socket.disconnect(); reject(err); });
    open.push(socket);
  });
}
const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const resources = (socket) => socket.events.map((e) => e.resource).sort();
const api = (token) => ({
  post: (path, body) => request(base).post(`/api${path}`).set(auth(token)).send(body || {}),
  patch: (path, body) => request(base).patch(`/api${path}`).set(auth(token)).send(body || {}),
});

describe('who may connect', () => {
  test('no token, a bad token, or a deactivated user is refused', async () => {
    await expect(listen(undefined)).rejects.toThrow('unauthorized');
    await expect(listen('not-a-token')).rejects.toThrow('unauthorized');
    const { user, token } = await createUser('cashier');
    user.active = false;
    await user.save();
    await expect(listen(token)).rejects.toThrow('unauthorized');
  });

  test('a signed-in user connects', async () => {
    const { token } = await createUser('cashier');
    const socket = await listen(token);
    expect(socket.connected).toBe(true);
  });

  test('a connection ends when the sign-in token expires', async () => {
    const { user } = await createUser('cashier');
    const shortLived = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: 1 });
    const socket = await listen(shortLived);
    expect(socket.connected).toBe(true);
    await settle(1500);
    expect(socket.connected).toBe(false);
  });
});

describe('updates reach only the people allowed to see that data', () => {
  let admin, accountant, cashier, nobody, account;
  let sAdmin, sAccountant, sCashier, sNobody;
  beforeEach(async () => {
    admin = await createUser('admin');
    accountant = await createUser('accountant');
    cashier = await createUser('cashier');
    await makeRole('nobody', []);
    nobody = await createUser('nobody');
    account = await makeAccount();
    [sAdmin, sAccountant, sCashier, sNobody] = await Promise.all([admin, accountant, cashier, nobody].map((u) => listen(u.token)));
  });

  test('recording income tells income viewers, reports viewers and the activity log', async () => {
    const res = await api(cashier.token).post('/incomes', { amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id });
    expect(res.status).toBe(201);
    await settle();
    expect(resources(sCashier)).toEqual(['incomes']); // can see income, not reports or the log
    expect(resources(sAccountant)).toEqual(['incomes', 'reports']);
    expect(resources(sAdmin)).toEqual(['audit', 'incomes', 'reports']);
    expect(sNobody.events).toEqual([]);
    expect(sCashier.events[0]).toMatchObject({ resource: 'incomes', action: 'create', id: res.body._id });
  });

  test('voiding says so', async () => {
    const made = await api(cashier.token).post('/incomes', { amount: 100, date: '2026-01-15', method: 'pos', accountId: account.id });
    await settle();
    sCashier.events.length = 0;
    await api(cashier.token).post(`/incomes/${made.body._id}/void`, { reason: 'Entered twice' });
    await settle();
    expect(sCashier.events).toEqual([{ resource: 'incomes', action: 'void', id: made.body._id }]);
  });

  test('expenses reach expense viewers only', async () => {
    await api(accountant.token).post('/expenses', { amount: 5000, date: '2026-01-15', accountId: account.id, type: 'Recurrent', group: 'Staff Wages' });
    await settle();
    expect(resources(sAccountant)).toEqual(['expenses', 'reports']);
    expect(sCashier.events).toEqual([]);
    expect(sNobody.events).toEqual([]);
  });

  test('accounts and categories are visible to everyone signed in', async () => {
    await api(admin.token).post('/accounts', { name: 'Petty cash', type: 'cash' });
    await api(admin.token).post('/categories/types', { name: 'Research' });
    await settle();
    for (const s of [sAdmin, sAccountant, sCashier, sNobody]) {
      expect(resources(s)).toEqual(expect.arrayContaining(['accounts', 'categories']));
    }
    expect(resources(sNobody)).toEqual(['accounts', 'categories']);
  });

  test('user and role changes reach people who manage users', async () => {
    await api(admin.token).post('/users', { name: 'New', email: 'new@test.com', password: 'password123', role: 'cashier' });
    await settle();
    expect(resources(sAdmin)).toEqual(expect.arrayContaining(['users', 'roles', 'audit']));
    expect(sCashier.events).toEqual([]);
    expect(sAccountant.events).toEqual([]);
  });

  test('signing in only shows up in the activity log', async () => {
    await request(base).post('/api/auth/login').send({ email: cashier.user.email, password: 'password123' });
    await settle();
    expect(resources(sAdmin)).toEqual(['audit']);
    expect(sCashier.events).toEqual([]);
  });

  test('the message carries no business data', async () => {
    await api(cashier.token).post('/incomes', { amount: 987654, date: '2026-01-15', method: 'transfer', accountId: account.id });
    await settle();
    for (const e of sAdmin.events) {
      expect(Object.keys(e).sort()).toEqual(['action', 'id', 'resource']);
      expect(JSON.stringify(e)).not.toMatch(/987654|RCP-|transfer/);
    }
  });
});

describe('changes to a person\'s access apply to their live connection', () => {
  test('editing a role re-tunes its members without a reconnect', async () => {
    const admin = await createUser('admin');
    const account = await makeAccount();
    await makeRole('clerk', ['income.view', 'income.record']);
    const clerk = await createUser('clerk');
    const recorder = await createUser('cashier');
    const sClerk = await listen(clerk.token);

    await api(recorder.token).post('/incomes', { amount: 100, date: '2026-01-15', method: 'pos', accountId: account.id });
    await settle();
    expect(resources(sClerk)).toEqual(['incomes']);
    sClerk.events.length = 0;

    await api(admin.token).patch('/roles/clerk', { permissions: ['income.record'] }); // income.view removed
    await settle();
    expect(sClerk.events).toContainEqual({ resource: '(access)', action: 'changed' });
    sClerk.events.length = 0;

    await api(recorder.token).post('/incomes', { amount: 200, date: '2026-01-15', method: 'pos', accountId: account.id });
    await settle();
    expect(sClerk.events).toEqual([]); // no longer allowed to see income changes
    await Role.updateOne({ key: 'clerk' }, { $set: { permissions: ['income.view'] } });
  });

  test('deactivating a user cuts them off', async () => {
    const admin = await createUser('admin');
    const victim = await createUser('cashier');
    const sVictim = await listen(victim.token);
    expect(sVictim.connected).toBe(true);
    await api(admin.token).patch(`/users/${victim.user.id}`, { active: false });
    await settle();
    expect(sVictim.revoked).toBe(true);
    expect(sVictim.connected).toBe(false);
  });
});
