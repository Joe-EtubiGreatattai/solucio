const Role = require('../src/models/Role');
const { PERMISSIONS, PERMISSION_KEYS, permissionsForRole } = require('../src/config/permissions');
const { ensureBuiltInRoles } = require('../src/services/roles');

test('permission keys are unique and every one has a label and group', () => {
  expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  for (const p of PERMISSIONS) {
    expect(p.label).toEqual(expect.any(String));
    expect(p.group).toEqual(expect.any(String));
  }
});

test('the built-in roles start with their defined access', async () => {
  await ensureBuiltInRoles();
  const by = Object.fromEntries((await Role.find()).map((r) => [r.key, r]));
  expect(Object.keys(by).sort()).toEqual(['accountant', 'admin', 'cashier']);
  expect(by.cashier.permissions.sort()).toEqual(['income.record', 'income.view', 'income.void']);
  expect(by.accountant.permissions.sort()).toEqual([
    'expenses.record', 'expenses.view', 'expenses.void', 'income.record', 'income.view', 'income.void',
    'reports.export', 'reports.view', 'statements.import', 'statements.review', 'statements.view',
  ]);
  expect(by.admin.permissions.sort()).toEqual([...PERMISSION_KEYS].sort());
  expect(Object.values(by).every((r) => r.builtIn)).toBe(true);
});

test('running it again never overwrites edits, but the Admin role is always complete', async () => {
  await ensureBuiltInRoles();
  await Role.updateOne({ key: 'cashier' }, { $set: { permissions: ['income.view'], name: 'Front desk' } });
  await Role.updateOne({ key: 'admin' }, { $set: { permissions: [] } });
  await ensureBuiltInRoles();
  const cashier = await Role.findOne({ key: 'cashier' });
  expect(cashier.permissions).toEqual(['income.view']);
  expect(cashier.name).toBe('Front desk');
  expect((await Role.findOne({ key: 'admin' })).permissions.sort()).toEqual([...PERMISSION_KEYS].sort());
  expect(await Role.countDocuments()).toBe(3);
});

test('it is safe to run concurrently', async () => {
  await Promise.all([ensureBuiltInRoles(), ensureBuiltInRoles(), ensureBuiltInRoles()]);
  expect(await Role.countDocuments()).toBe(3);
});

test('permissionsForRole gives Admin everything and drops unknown keys from others', () => {
  expect(permissionsForRole({ key: 'admin', permissions: [] }).sort()).toEqual([...PERMISSION_KEYS].sort());
  expect(permissionsForRole({ key: 'clerk', permissions: ['income.view', 'made.up'] })).toEqual(['income.view']);
  expect(permissionsForRole(null)).toEqual([]);
});

test('the model rejects unknown permissions and duplicate names', async () => {
  await expect(Role.create({ key: 'x', name: 'X', permissions: ['made.up'] })).rejects.toThrow();
  await Role.init();
  await Role.create({ key: 'clerk', name: 'Clerk', permissions: [] });
  await expect(Role.create({ key: 'clerk-2', name: 'clerk', permissions: [] })).rejects.toMatchObject({ code: 11000 });
});
