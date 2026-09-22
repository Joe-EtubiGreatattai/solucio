const request = require('supertest');
const app = require('../src/app');
const { createUser, auth } = require('./helpers');

const ID = '64b7f0000000000000000000';
const ALL = ['cashier', 'accountant', 'admin'];
const FIN = ['accountant', 'admin'];
const ADMIN = ['admin'];
const RANGE = 'from=2026-01-01&to=2026-01-31';

// [method, path, roles allowed past the role guard]
const ROUTES = [
  ['get', '/api/auth/me', ALL],
  ['get', '/api/categories', ALL],
  ['get', '/api/accounts', ALL],
  ['post', '/api/accounts', ADMIN],
  ['patch', `/api/accounts/${ID}`, ADMIN],
  ['post', '/api/incomes', ALL],
  ['get', '/api/incomes', ALL],
  ['get', `/api/incomes/${ID}/receipt`, ALL],
  ['post', `/api/incomes/${ID}/void`, ALL],
  ['post', '/api/expenses', FIN],
  ['get', '/api/expenses', FIN],
  ['post', `/api/expenses/${ID}/void`, FIN],
  ['get', `/api/reports/summary?${RANGE}`, FIN],
  ['get', `/api/reports/spending-by-category?${RANGE}`, FIN],
  ['get', '/api/reports/account-balances', FIN],
  ['get', `/api/reports/cash-flow?${RANGE}`, FIN],
  ['get', `/api/reports/export?type=income&format=xlsx&${RANGE}`, FIN],
  ['get', '/api/audit-logs', ADMIN],
  ['get', '/api/categories/all', ADMIN],
  ['post', '/api/categories/types', ADMIN],
  ['post', '/api/categories/groups', ADMIN],
  ['post', '/api/categories/items', ADMIN],
  ['patch', '/api/categories/active', ADMIN],
  ['get', '/api/roles', ADMIN],
  ['post', '/api/roles', ADMIN],
  ['patch', '/api/roles/cashier', ADMIN],
  ['delete', '/api/roles/nope', ADMIN],
  ['get', '/api/users', ADMIN],
  ['post', '/api/users', ADMIN],
  ['patch', `/api/users/${ID}`, ADMIN],
];

const tokens = {};
beforeEach(async () => {
  for (const role of ALL) tokens[role] = (await createUser(role)).token;
});

describe.each(ROUTES)('%s %s', (method, path, allowed) => {
  test('requires a token', async () => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });
  test.each(ALL)('role %s', async (role) => {
    const res = await request(app)[method](path).set(auth(tokens[role])).send({});
    if (allowed.includes(role)) expect([401, 403]).not.toContain(res.status);
    else expect(res.status).toBe(403);
  });
});
