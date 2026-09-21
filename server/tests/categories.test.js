const request = require('supertest');
const app = require('../src/app');
const Category = require('../src/models/Category');
const { DEFAULT_CATEGORIES } = require('../src/config/categories');
const { ensureDefaultCategories, getTree, assertValidCategory } = require('../src/services/categories');
const { createUser, auth } = require('./helpers');

const valid = async (t, g, i) => assertValidCategory(t, g, i).then(() => true, () => false);

test('the default tree seeds from the shipped list, in order', async () => {
  await ensureDefaultCategories();
  const tree = await getTree();
  expect(tree.map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
  const recurrent = tree[0].groups.map((g) => g.name);
  expect(recurrent).toEqual(Object.keys(DEFAULT_CATEGORIES.Recurrent));
  const equipment = tree[1].groups.find((g) => g.name === 'Equipment');
  expect(equipment.items.map((i) => i.name)).toEqual(['Nursing', 'Laboratory', 'Radiology', 'Theatre', 'Ophthalmology']);
  expect(tree[0].groups.find((g) => g.name === 'Staff Wages').items).toEqual([]);
  expect(tree.every((c) => c.active && c.groups.every((g) => g.active && g.items.every((i) => i.active)))).toBe(true);
});

test('seeding runs once: it never overwrites what an admin has added', async () => {
  await ensureDefaultCategories();
  await Category.updateOne({ name: 'Recurrent' }, { $push: { groups: { name: 'Security', items: [] } } });
  await ensureDefaultCategories();
  await Promise.all([ensureDefaultCategories(), ensureDefaultCategories()]);
  expect(await Category.countDocuments()).toBe(2);
  expect((await getTree())[0].groups.map((g) => g.name)).toContain('Security');
});

test('assertValidCategory accepts real paths and rejects invented ones', async () => {
  await ensureDefaultCategories();
  expect(await valid('Recurrent', 'Hospital Consumables', 'Oxygen')).toBe(true);
  expect(await valid('Recurrent', 'Staff Wages', null)).toBe(true);
  expect(await valid('Recurrent', 'Staff Wages', undefined)).toBe(true);
  expect(await valid('Recurrent', 'Staff Wages', 'Bonus')).toBe(false);
  expect(await valid('Recurrent', 'Hospital Consumables', null)).toBe(false);
  expect(await valid('Capital', 'Structural', 'Nursing')).toBe(false);
  expect(await valid('Capital', 'Equipment', 'Nursing')).toBe(true);
  expect(await valid('constructor', 'x', null)).toBe(false);
  expect(await valid('recurrent', 'Staff Wages', null)).toBe(false); // must be the exact name
});

test('the error names the category field', async () => {
  await ensureDefaultCategories();
  await expect(assertValidCategory('Nope', 'x', null)).rejects.toMatchObject({ status: 400, fields: { category: expect.any(String) } });
});

test('hidden nodes are not valid for new expenses', async () => {
  await ensureDefaultCategories();
  await Category.updateOne({ name: 'Capital' }, { $set: { 'groups.$[g].items.$[i].active': false } }, { arrayFilters: [{ 'g.name': 'Equipment' }, { 'i.name': 'Nursing' }] });
  expect(await valid('Capital', 'Equipment', 'Nursing')).toBe(false);
  expect(await valid('Capital', 'Equipment', 'Radiology')).toBe(true);
  await Category.updateOne({ name: 'Capital' }, { $set: { 'groups.$[g].active': false } }, { arrayFilters: [{ 'g.name': 'Structural' }] });
  expect(await valid('Capital', 'Structural', 'Building')).toBe(false);
  await Category.updateOne({ name: 'Capital' }, { $set: { active: false } });
  expect(await valid('Capital', 'Equipment', 'Radiology')).toBe(false);
});

test('a group that gains an item now requires one', async () => {
  await ensureDefaultCategories();
  await Category.updateOne({ name: 'Recurrent' }, { $push: { 'groups.$[g].items': { name: 'Bonus' } } }, { arrayFilters: [{ 'g.name': 'Staff Wages' }] });
  expect(await valid('Recurrent', 'Staff Wages', null)).toBe(false);
  expect(await valid('Recurrent', 'Staff Wages', 'Bonus')).toBe(true);
});

describe('GET /api/categories', () => {
  test('needs sign-in and returns the active tree with plain item names', async () => {
    expect((await request(app).get('/api/categories')).status).toBe(401);
    const { token } = await createUser('cashier');
    const res = await request(app).get('/api/categories').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
    expect(res.body[1].groups.find((g) => g.name === 'Equipment').items).toContain('Ophthalmology');
    expect(res.body[0].groups.find((g) => g.name === 'Staff Wages').items).toEqual([]);
  });

  test('hidden groups and items are left out', async () => {
    const { token } = await createUser('cashier');
    await Category.updateOne({ name: 'Capital' }, { $set: { 'groups.$[g].items.$[i].active': false } }, { arrayFilters: [{ 'g.name': 'Equipment' }, { 'i.name': 'Nursing' }] });
    await Category.updateOne({ name: 'Recurrent' }, { $set: { 'groups.$[g].active': false } }, { arrayFilters: [{ 'g.name': 'Charity' }] });
    const res = await request(app).get('/api/categories').set(auth(token));
    expect(res.body[1].groups.find((g) => g.name === 'Equipment').items).not.toContain('Nursing');
    expect(res.body[0].groups.map((g) => g.name)).not.toContain('Charity');
  });
});
