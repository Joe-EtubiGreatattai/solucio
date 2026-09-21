const request = require('supertest');
const app = require('../src/app');
const { listCategories, isValidCategory } = require('../src/config/categories');
const { createUser, auth } = require('./helpers');

test('tree has Recurrent and Capital in order', () => {
  expect(listCategories().map((c) => c.type)).toEqual(['Recurrent', 'Capital']);
});

test('isValidCategory accepts real paths and rejects invented ones', () => {
  expect(isValidCategory('Recurrent', 'Hospital Consumables', 'Oxygen')).toBe(true);
  expect(isValidCategory('Recurrent', 'Staff Wages', null)).toBe(true);
  expect(isValidCategory('Recurrent', 'Staff Wages', 'Bonus')).toBe(false);
  expect(isValidCategory('Recurrent', 'Hospital Consumables', null)).toBe(false);
  expect(isValidCategory('Capital', 'Structural', 'Nursing')).toBe(false);
  expect(isValidCategory('Capital', 'Equipment', 'Nursing')).toBe(true);
  expect(isValidCategory('constructor', 'x', null)).toBe(false);
});

test('GET /api/categories needs auth and returns the tree', async () => {
  expect((await request(app).get('/api/categories')).status).toBe(401);
  const { token } = await createUser('cashier');
  const res = await request(app).get('/api/categories').set(auth(token));
  expect(res.status).toBe(200);
  expect(res.body[1].groups.find((g) => g.name === 'Equipment').items).toContain('Ophthalmology');
});
