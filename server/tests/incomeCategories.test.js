const request = require('supertest');
const app = require('../src/app');
const Category = require('../src/models/Category');
const { DEFAULT_INCOME_CATEGORIES } = require('../src/config/categories');
const { ensureDefaultCategories, getTree, publicTree, assertValidCategory } = require('../src/services/categories');
const { createUser, auth } = require('./helpers');

const okIncome = (t, g, i) => assertValidCategory(t, g, i, 'income').then(() => true, () => false);

describe('income category tree', () => {
  test('seeds an income tree separately from the expense tree', async () => {
    await ensureDefaultCategories();
    const income = await getTree({ kind: 'income' });
    const expense = await getTree({ kind: 'expense' });
    expect(income.map((c) => c.type)).toEqual(Object.keys(DEFAULT_INCOME_CATEGORIES));
    expect(expense.map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
    // same group name can exist in both trees without clashing
    expect(income.length).toBeGreaterThan(0);
  });

  test('old installs: categories with no kind become expenses, and income seeds alongside', async () => {
    await Category.create({ name: 'Legacy', order: 9, groups: [] }); // no kind -> should become expense
    await Category.collection.updateOne({ name: 'Legacy' }, { $unset: { kind: '' } });
    await ensureDefaultCategories();
    expect((await getTree({ kind: 'expense' })).some((c) => c.type === 'Legacy')).toBe(true);
    expect((await getTree({ kind: 'income' })).length).toBeGreaterThan(0);
  });

  test('assertValidCategory checks the right tree for the kind', async () => {
    await ensureDefaultCategories();
    const incomeType = (await getTree({ kind: 'income' }))[0];
    expect(await okIncome(incomeType.type, incomeType.groups[0].name, null)).toBe(incomeType.groups[0].items.length === 0);
    // an expense category is not valid as an income category
    expect(await okIncome('Recurrent', 'Staff Wages', null)).toBe(false);
  });

  test('publicTree(income) returns only the active income tree with plain item names', async () => {
    await ensureDefaultCategories();
    const tree = await publicTree('income');
    expect(tree.map((c) => c.type)).toEqual(Object.keys(DEFAULT_INCOME_CATEGORIES));
    expect(tree[0].groups[0]).toHaveProperty('items');
  });
});

describe('managing income categories through the API', () => {
  const body = (extra) => ({ kind: 'income', ...extra });
  test('an admin adds, hides and removes income categories without touching expenses', async () => {
    const { token } = await createUser('admin');
    const post = (path, b) => request(app).post(`/api/categories/${path}`).set(auth(token)).send(b);

    const added = await post('types', body({ name: 'Grants' }));
    expect(added.status).toBe(201);
    expect(added.body.some((c) => c.type === 'Grants')).toBe(true); // returns the income tree
    expect(added.body.some((c) => c.type === 'Recurrent')).toBe(false); // not the expense tree

    await post('groups', body({ type: 'Grants', name: 'Research' }));
    const withItem = await post('items', body({ type: 'Grants', group: 'Research', name: 'Equipment grant' }));
    expect(withItem.body.find((c) => c.type === 'Grants').groups[0].items.map((i) => i.name)).toContain('Equipment grant');

    const hidden = await request(app).patch('/api/categories/active').set(auth(token)).send(body({ type: 'Grants', active: false }));
    expect(hidden.body.find((c) => c.type === 'Grants').active).toBe(false);

    const removed = await request(app).post('/api/categories/remove').set(auth(token)).send(body({ type: 'Grants', group: 'Research', item: 'Equipment grant' }));
    expect(removed.body.find((c) => c.type === 'Grants').groups[0].items).toEqual([]);
  });

  test('GET /api/categories?kind=income returns the income tree; default stays expense', async () => {
    const { token } = await createUser('cashier');
    const income = await request(app).get('/api/categories?kind=income').set(auth(token));
    expect(income.body.map((c) => c.type)).toEqual(Object.keys(DEFAULT_INCOME_CATEGORIES));
    const expense = await request(app).get('/api/categories').set(auth(token));
    expect(expense.body.map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
  });
});
