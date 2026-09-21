const request = require('supertest');
const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog');
const { createUser, auth, makeAccount, makeRole } = require('./helpers');

let admin, account;
beforeEach(async () => { admin = await createUser('admin'); account = await makeAccount(); });

const post = (token, path, body) => request(app).post(`/api/categories/${path}`).set(auth(token)).send(body);
const active = (token, body) => request(app).patch('/api/categories/active').set(auth(token)).send(body);
const all = (token) => request(app).get('/api/categories/all').set(auth(token));
const publicTree = (token) => request(app).get('/api/categories').set(auth(token)).then((r) => r.body);
const expense = (token, o) => request(app).post('/api/expenses').set(auth(token)).send({ amount: 1000, date: '2026-01-15', accountId: account.id, ...o });

describe('who may change categories', () => {
  test('only roles with categories.manage; admin has it', async () => {
    const cashier = await createUser('cashier');
    expect((await all(cashier.token)).status).toBe(403);
    expect((await post(cashier.token, 'types', { name: 'X' })).status).toBe(403);
    expect((await active(cashier.token, { type: 'Capital', active: false })).status).toBe(403);
    await makeRole('catmgr', ['categories.manage']);
    const mgr = await createUser('catmgr');
    expect((await all(mgr.token)).status).toBe(200);
    expect((await post(mgr.token, 'types', { name: 'Research' })).status).toBe(201);
    expect((await all(admin.token)).status).toBe(200);
  });
});

describe('adding categories, groups and items', () => {
  test('adds a category and it appears everywhere', async () => {
    const res = await post(admin.token, 'types', { name: 'Research' });
    expect(res.status).toBe(201);
    expect(res.body.map((c) => c.type)).toEqual(['Recurrent', 'Capital', 'Research']);
    expect(res.body[2]).toMatchObject({ active: true, groups: [] });
    expect((await publicTree(admin.token)).map((c) => c.type)).toContain('Research');
  });

  test('adds a group to a category, and an item to a group', async () => {
    await post(admin.token, 'groups', { type: 'Recurrent', name: 'Security' });
    const res = await post(admin.token, 'items', { type: 'Recurrent', group: 'Security', name: 'Night guards' });
    expect(res.status).toBe(201);
    const security = res.body[0].groups.find((g) => g.name === 'Security');
    expect(security).toMatchObject({ active: true, items: [{ name: 'Night guards', active: true }] });
    const pub = await publicTree(admin.token);
    expect(pub[0].groups.find((g) => g.name === 'Security').items).toEqual(['Night guards']);
  });

  test('a new category, group and item can be used on an expense straight away', async () => {
    await post(admin.token, 'groups', { type: 'Capital', name: 'Vehicles' });
    await post(admin.token, 'items', { type: 'Capital', group: 'Vehicles', name: 'Ambulance' });
    const ok = await expense(admin.token, { type: 'Capital', group: 'Vehicles', item: 'Ambulance' });
    expect(ok.status).toBe(201);
    await post(admin.token, 'types', { name: 'Research' });
    await post(admin.token, 'groups', { type: 'Research', name: 'Trials' });
    expect((await expense(admin.token, { type: 'Research', group: 'Trials' })).status).toBe(201);
  });

  test('names are trimmed, must be present, and stay under 60 characters', async () => {
    const res = await post(admin.token, 'types', { name: '  Research  ' });
    expect(res.body.map((c) => c.type)).toContain('Research');
    expect((await post(admin.token, 'types', { name: '   ' })).body.fields.name).toBeDefined();
    expect((await post(admin.token, 'types', { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await post(admin.token, 'groups', { type: 'Recurrent' })).status).toBe(400);
  });

  test('duplicates are refused at each level, ignoring case', async () => {
    expect((await post(admin.token, 'types', { name: 'recurrent' })).status).toBe(409);
    expect((await post(admin.token, 'groups', { type: 'Recurrent', name: 'rents' })).status).toBe(409);
    expect((await post(admin.token, 'items', { type: 'Recurrent', group: 'Tax and Dues', name: 'paye' })).status).toBe(409);
    // the same name in a different parent is fine
    expect((await post(admin.token, 'items', { type: 'Recurrent', group: 'Rents', name: 'PAYE' })).status).toBe(201);
  });

  test('unknown parents are 404', async () => {
    expect((await post(admin.token, 'groups', { type: 'Nope', name: 'X' })).status).toBe(404);
    expect((await post(admin.token, 'items', { type: 'Recurrent', group: 'Nope', name: 'X' })).status).toBe(404);
  });

  test('giving a leaf group its first item makes an item required from then on', async () => {
    expect((await expense(admin.token, { type: 'Recurrent', group: 'Rents' })).status).toBe(201);
    await post(admin.token, 'items', { type: 'Recurrent', group: 'Rents', name: 'Warehouse' });
    const res = await expense(admin.token, { type: 'Recurrent', group: 'Rents' });
    expect(res.status).toBe(400);
    expect(res.body.fields.category).toBeDefined();
    expect((await expense(admin.token, { type: 'Recurrent', group: 'Rents', item: 'Warehouse' })).status).toBe(201);
  });

  test('additions are audited', async () => {
    await post(admin.token, 'types', { name: 'Research' });
    await post(admin.token, 'groups', { type: 'Research', name: 'Trials' });
    await post(admin.token, 'items', { type: 'Research', group: 'Trials', name: 'Phase 1' });
    const logs = await AuditLog.find({ action: 'category.add' }).sort('createdAt');
    expect(logs.map((l) => l.details)).toEqual([
      { level: 'category', path: ['Research'] },
      { level: 'group', path: ['Research', 'Trials'] },
      { level: 'item', path: ['Research', 'Trials', 'Phase 1'] },
    ]);
  });
});

describe('hiding and showing', () => {
  test('a hidden item leaves the forms but old expenses keep it', async () => {
    const before = await expense(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing' });
    expect(before.status).toBe(201);
    const hide = await active(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing', active: false });
    expect(hide.status).toBe(200);
    expect(hide.body[1].groups.find((g) => g.name === 'Equipment').items.find((i) => i.name === 'Nursing').active).toBe(false);
    expect((await publicTree(admin.token))[1].groups.find((g) => g.name === 'Equipment').items).not.toContain('Nursing');
    expect((await expense(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing' })).status).toBe(400);
    const list = await request(app).get('/api/expenses?item=Nursing').set(auth(admin.token));
    expect(list.body.total).toBe(1);
    await active(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing', active: true });
    expect((await expense(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing' })).status).toBe(201);
  });

  test('hides and shows a group and a whole category', async () => {
    await active(admin.token, { type: 'Recurrent', group: 'Charity', active: false });
    expect((await publicTree(admin.token))[0].groups.map((g) => g.name)).not.toContain('Charity');
    expect((await expense(admin.token, { type: 'Recurrent', group: 'Charity' })).status).toBe(400);
    await active(admin.token, { type: 'Capital', active: false });
    expect((await publicTree(admin.token)).map((c) => c.type)).toEqual(['Recurrent']);
    expect((await all(admin.token)).body.map((c) => c.type)).toEqual(['Recurrent', 'Capital']); // admin still sees it
    await active(admin.token, { type: 'Capital', active: true });
    expect((await publicTree(admin.token)).map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
  });

  test('validates the request and reports missing nodes', async () => {
    expect((await active(admin.token, { type: 'Capital', item: 'Nursing', active: false })).status).toBe(400); // item needs a group
    expect((await active(admin.token, { type: 'Capital' })).status).toBe(400); // needs active
    expect((await active(admin.token, { type: 'Nope', active: false })).status).toBe(404);
    expect((await active(admin.token, { type: 'Capital', group: 'Nope', active: false })).status).toBe(404);
    expect((await active(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nope', active: false })).status).toBe(404);
  });

  test('changes are audited', async () => {
    await active(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing', active: false });
    const log = await AuditLog.findOne({ action: 'category.update' });
    expect(log.details).toEqual({ path: ['Capital', 'Equipment', 'Nursing'], active: false });
  });
});
