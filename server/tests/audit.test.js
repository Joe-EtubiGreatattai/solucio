const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount } = require('./helpers');

let admin, cashier;
beforeEach(async () => {
  admin = await createUser('admin');
  cashier = await createUser('cashier');
});
const list = (token, q = '') => request(app).get(`/api/audit-logs${q}`).set(auth(token));
const entry = (o) => AuditLog.create({ actor: admin.user._id, targetModel: 'Income', targetId: admin.user._id, ...o });

describe('GET /api/audit-logs', () => {
  test('is admin-only', async () => {
    expect((await list(cashier.token)).status).toBe(403);
    expect((await request(app).get('/api/audit-logs')).status).toBe(401);
  });

  test('lists newest first with the actor populated and a total', async () => {
    await entry({ action: 'income.create', createdAt: new Date('2026-01-10T09:00:00Z') });
    await entry({ action: 'expense.create', actor: cashier.user._id, createdAt: new Date('2026-01-12T09:00:00Z') });
    const res = await list(admin.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i) => i.action)).toEqual(['expense.create', 'income.create']);
    expect(res.body.items[0].actor).toMatchObject({ name: cashier.user.name, role: 'cashier' });
    expect(res.body.items[0].actor.passwordHash).toBeUndefined();
  });

  test('filters by action and by actor', async () => {
    await entry({ action: 'income.create' });
    await entry({ action: 'income.void', actor: cashier.user._id });
    expect((await list(admin.token, '?action=income.void')).body.total).toBe(1);
    const byActor = await list(admin.token, `?actorId=${cashier.user.id}`);
    expect(byActor.body.items.map((i) => i.action)).toEqual(['income.void']);
  });

  test('date range is inclusive and follows the Lagos day', async () => {
    await entry({ action: 'a.in-start', createdAt: new Date('2026-01-14T23:00:00Z') }); // 15th 00:00 Lagos
    await entry({ action: 'a.in-end', createdAt: new Date('2026-01-15T22:59:59.999Z') }); // 15th 23:59:59.999
    await entry({ action: 'a.before', createdAt: new Date('2026-01-14T22:59:59.999Z') });
    await entry({ action: 'a.after', createdAt: new Date('2026-01-15T23:00:00Z') });
    const res = await list(admin.token, '?from=2026-01-15&to=2026-01-15');
    expect(res.body.items.map((i) => i.action).sort()).toEqual(['a.in-end', 'a.in-start']);
  });

  test('paginates', async () => {
    for (let n = 0; n < 5; n += 1) await entry({ action: `x.${n}`, createdAt: new Date(2026, 0, n + 1) });
    const res = await list(admin.token, '?limit=2&page=2');
    expect(res.body).toMatchObject({ total: 5, page: 2, limit: 2 });
    expect(res.body.items).toHaveLength(2);
  });

  test('rejects operator injection and bad ids', async () => {
    expect((await list(admin.token, '?action[$ne]=x')).status).toBe(400);
    expect((await list(admin.token, '?actorId=nope')).status).toBe(400);
  });
});

describe('what gets logged', () => {
  const actions = async () => (await AuditLog.find().sort('createdAt')).map((l) => l.action);

  test('a successful sign-in is logged, a failed one is not', async () => {
    await request(app).post('/api/auth/login').send({ email: cashier.user.email, password: 'wrong-password' });
    expect(await actions()).toEqual([]);
    await request(app).post('/api/auth/login').send({ email: cashier.user.email, password: 'password123' });
    const [log] = await AuditLog.find();
    expect(log).toMatchObject({ action: 'auth.login', targetModel: 'User' });
    expect(String(log.actor)).toBe(cashier.user.id);
  });

  test('creating and changing a user is logged and never stores the password', async () => {
    const created = await request(app).post('/api/users').set(auth(admin.token))
      .send({ name: 'Ada', email: 'ada@test.com', password: 'password123', role: 'cashier' });
    await request(app).patch(`/api/users/${created.body._id}`).set(auth(admin.token))
      .send({ role: 'accountant', password: 'newpassword1' });
    const logs = await AuditLog.find().sort('createdAt');
    expect(logs.map((l) => l.action)).toEqual(['user.create', 'user.update']);
    expect(logs[0].details).toMatchObject({ name: 'Ada', email: 'ada@test.com', role: 'cashier' });
    expect(logs[1].details).toMatchObject({ changes: { role: 'accountant' }, passwordReset: true });
    expect(JSON.stringify(logs.map((l) => l.details))).not.toMatch(/password123|newpassword1|passwordHash/);
  });

  test('creating and changing an account is logged', async () => {
    const created = await request(app).post('/api/accounts').set(auth(admin.token))
      .send({ name: 'Ops', type: 'bank', bankName: 'Zenith', accountNumber: '1234567890', openingBalance: 500000 });
    await request(app).patch(`/api/accounts/${created.body._id}`).set(auth(admin.token)).send({ active: false });
    const logs = await AuditLog.find().sort('createdAt');
    expect(logs.map((l) => l.action)).toEqual(['account.create', 'account.update']);
    expect(logs[0].details).toMatchObject({ name: 'Ops', type: 'bank', openingBalance: 500000 });
    expect(logs[1].details).toMatchObject({ name: 'Ops', changes: { active: false } });
  });

  test('a void records what was voided, not just the reason', async () => {
    const account = await makeAccount();
    const inc = await request(app).post('/api/incomes').set(auth(cashier.token))
      .send({ amount: 150000, date: '2026-01-15', method: 'transfer', accountId: account.id });
    await request(app).post(`/api/incomes/${inc.body._id}/void`).set(auth(cashier.token)).send({ reason: 'Entered twice' });
    const exp = await request(app).post('/api/expenses').set(auth(admin.token))
      .send({ amount: 50000, date: '2026-01-15', accountId: account.id, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' });
    await request(app).post(`/api/expenses/${exp.body._id}/void`).set(auth(admin.token)).send({ reason: 'Duplicate' });
    const voids = await AuditLog.find({ action: /void$/ }).sort('createdAt');
    expect(voids[0].details).toMatchObject({ reason: 'Entered twice', amount: 150000, receiptNumber: 'RCP-2026-0001' });
    expect(voids[1].details).toMatchObject({ reason: 'Duplicate', amount: 50000, type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' });
  });
});
