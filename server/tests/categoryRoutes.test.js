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
      { kind: 'expense', level: 'category', path: ['Research'] },
      { kind: 'expense', level: 'group', path: ['Research', 'Trials'] },
      { kind: 'expense', level: 'item', path: ['Research', 'Trials', 'Phase 1'] },
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
    expect(log.details).toEqual({ kind: 'expense', path: ['Capital', 'Equipment', 'Nursing'], active: false });
  });
});

describe('removing categories, groups and items', () => {
  const Statement = require('../src/models/Statement');
  const remove = (token, body) => request(app).post('/api/categories/remove').set(auth(token)).send(body);
  const names = (tree, type) => tree.find((c) => c.type === type);

  test('an unused item, group and whole category can be removed', async () => {
    await post(admin.token, 'types', { name: 'Research' });
    await post(admin.token, 'groups', { type: 'Research', name: 'Grants' });
    await post(admin.token, 'items', { type: 'Research', group: 'Grants', name: 'Travel' });

    let res = await remove(admin.token, { type: 'Research', group: 'Grants', item: 'Travel' });
    expect(res.status).toBe(200);
    expect(names(res.body, 'Research').groups[0].items).toEqual([]);

    res = await remove(admin.token, { type: 'Research', group: 'Grants' });
    expect(names(res.body, 'Research').groups).toEqual([]);

    res = await remove(admin.token, { type: 'Research' });
    expect(names(res.body, 'Research')).toBeUndefined();
    expect(names(await publicTree(admin.token), 'Research')).toBeUndefined();
  });

  test('something an expense uses is refused, with how many and what to do instead', async () => {
    await expense(admin.token, { type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' });
    for (const body of [
      { type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' },
      { type: 'Recurrent', group: 'Hospital Consumables' },
      { type: 'Recurrent' },
    ]) {
      const res = await remove(admin.token, body);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/1 expense.*Hide it instead/);
    }
    // Something else in the same group is still removable.
    expect((await remove(admin.token, { type: 'Recurrent', group: 'Hospital Consumables', item: 'Drugs' })).status).toBe(200);
  });

  test('something a statement still in review uses is refused', async () => {
    await Statement.create({
      account: account._id, fileName: 'x.pdf', uploadedBy: admin.user._id,
      transactions: [{ date: new Date('2026-01-15'), narration: 'RENT', amount: 1000, direction: 'expense', type: 'Recurrent', group: 'Rents', item: null }],
    });
    const res = await remove(admin.token, { type: 'Recurrent', group: 'Rents' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/statement/);
  });

  test('only category managers may remove, missing nodes are 404, and removals are audited', async () => {
    const cashier = await createUser('cashier');
    expect((await remove(cashier.token, { type: 'Capital' })).status).toBe(403);
    expect((await remove(admin.token, { type: 'Nope' })).status).toBe(404);
    expect((await remove(admin.token, { type: 'Capital', group: 'Nope' })).status).toBe(404);
    expect((await remove(admin.token, { type: 'Capital', item: 'Desk' })).status).toBe(400);
    expect((await remove(admin.token, { type: 'Capital', group: 'Structural', item: 'Furniture' })).status).toBe(200);
    const log = await AuditLog.findOne({ action: 'category.remove' }).lean();
    expect(log.details).toMatchObject({ level: 'item', path: ['Capital', 'Structural', 'Furniture'] });
  });
});

describe('renaming categories, groups and items', () => {
  const Expense = require('../src/models/Expense');
  const Income = require('../src/models/Income');
  const Statement = require('../src/models/Statement');
  const rename = (token, body) => request(app).post('/api/categories/rename').set(auth(token)).send(body);
  const income = (token, o) => request(app).post('/api/incomes').set(auth(token)).send({ amount: 1000, date: '2026-01-15', method: 'transfer', accountId: account.id, ...o });

  test('renaming a group updates the tree and every expense and review-statement that used it', async () => {
    await expense(admin.token, { type: 'Recurrent', group: 'Rents' });
    await Statement.create({ account: account._id, fileName: 'x.pdf', uploadedBy: admin.user._id, status: 'review',
      transactions: [{ date: new Date('2026-01-15'), narration: 'RENT', amount: 1000, direction: 'expense', type: 'Recurrent', group: 'Rents', item: null }] });

    const res = await rename(admin.token, { type: 'Recurrent', group: 'Rents', name: 'Rent & Lease' });
    expect(res.status).toBe(200);
    expect(res.body.find((c) => c.type === 'Recurrent').groups.map((g) => g.name)).toContain('Rent & Lease');
    expect(await Expense.countDocuments({ type: 'Recurrent', group: 'Rent & Lease' })).toBe(1);
    expect(await Expense.countDocuments({ group: 'Rents' })).toBe(0);
    const st = await Statement.findOne({});
    expect(st.transactions[0].group).toBe('Rent & Lease');
  });

  test('renaming an item updates the expenses that used it', async () => {
    await expense(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing' });
    await rename(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing', name: 'Nursing Gear' });
    expect(await Expense.countDocuments({ item: 'Nursing Gear' })).toBe(1);
    expect(await Expense.countDocuments({ item: 'Nursing' })).toBe(0);
  });

  test('renaming a type updates its records', async () => {
    await expense(admin.token, { type: 'Capital', group: 'Equipment', item: 'Nursing' });
    await rename(admin.token, { type: 'Capital', name: 'Capital Spend' });
    expect(await Expense.countDocuments({ type: 'Capital Spend' })).toBe(1);
  });

  test('renaming an income category only touches income records, by kind', async () => {
    await income(admin.token, { type: 'Diagnostics', group: 'Laboratory' });
    await expense(admin.token, { type: 'Recurrent', group: 'Rents' });
    const res = await rename(admin.token, { kind: 'income', type: 'Diagnostics', group: 'Laboratory', name: 'Lab Services' });
    expect(res.body.find((c) => c.type === 'Diagnostics').groups.map((g) => g.name)).toContain('Lab Services');
    expect(await Income.countDocuments({ group: 'Lab Services' })).toBe(1);
    expect(await Expense.countDocuments({ group: 'Rents' })).toBe(1); // untouched
  });

  test('rejects a name that clashes with a sibling, missing nodes, and non-managers', async () => {
    expect((await rename(admin.token, { type: 'Recurrent', group: 'Rents', name: 'Staff Wages' })).status).toBe(409);
    expect((await rename(admin.token, { type: 'Nope', name: 'X' })).status).toBe(404);
    expect((await rename(admin.token, { type: 'Recurrent', group: 'Nope', name: 'X' })).status).toBe(404);
    const cashier = await createUser('cashier');
    expect((await rename(cashier.token, { type: 'Recurrent', name: 'X' })).status).toBe(403);
  });

  test('renames are audited', async () => {
    await rename(admin.token, { type: 'Recurrent', group: 'Rents', name: 'Rent & Lease' });
    const log = await AuditLog.findOne({ action: 'category.rename' }).lean();
    expect(log.details).toMatchObject({ kind: 'expense', path: ['Recurrent', 'Rents'], name: 'Rent & Lease' });
  });
});
