import { ACTIONS, actionLabel, describeActivity } from './activity';
import { formatDateTime } from './dates';

test('formatDateTime is day-first in Lagos time', () => {
  expect(formatDateTime('2026-09-21T10:30:00.000Z')).toBe('21/09/2026 11:30');
  expect(formatDateTime('2026-09-20T23:05:00.000Z')).toBe('21/09/2026 00:05');
});

test('every action has a plain label, and unknown ones fall back to the raw name', () => {
  expect(actionLabel('income.create')).toBe('Recorded income');
  expect(actionLabel('expense.void')).toBe('Voided expense');
  expect(actionLabel('auth.login')).toBe('Signed in');
  expect(actionLabel('something.new')).toBe('something.new');
  expect(ACTIONS.map((a) => a.value)).toEqual(expect.arrayContaining([
    'auth.login', 'income.create', 'income.void', 'expense.create', 'expense.void',
    'user.create', 'user.update', 'account.create', 'account.update',
    'role.create', 'role.update', 'role.delete', 'category.add', 'category.update',
  ]));
});

test('describes income and expense entries', () => {
  expect(describeActivity({ action: 'income.create', details: { receiptNumber: 'RCP-2026-0007', amount: 150050 } }))
    .toBe('RCP-2026-0007, ₦1,500.50');
  expect(describeActivity({ action: 'income.void', details: { receiptNumber: 'RCP-2026-0007', amount: 150050, reason: 'Entered twice' } }))
    .toBe('RCP-2026-0007, ₦1,500.50. Reason: Entered twice');
  expect(describeActivity({ action: 'expense.create', details: { type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen', amount: 50000 } }))
    .toBe('Recurrent › Hospital Consumables › Oxygen, ₦500.00');
  expect(describeActivity({ action: 'expense.void', details: { type: 'Recurrent', group: 'Staff Wages', item: null, amount: 100, reason: 'Duplicate' } }))
    .toBe('Recurrent › Staff Wages, ₦1.00. Reason: Duplicate');
});

test('describes old void entries that only stored a reason', () => {
  expect(describeActivity({ action: 'income.void', details: { reason: 'Entered twice' } })).toBe('Reason: Entered twice');
});

test('describes user and account changes without ever showing a password', () => {
  expect(describeActivity({ action: 'user.create', details: { name: 'Ada', email: 'ada@test.com', role: 'cashier' } }))
    .toBe('Ada (ada@test.com) as cashier');
  expect(describeActivity({ action: 'user.update', details: { name: 'Tunde Bello', email: 't@x.com', changes: { role: 'accountant', active: false }, passwordReset: true } }))
    .toBe('Tunde Bello: role → accountant, deactivated, password reset');
  expect(describeActivity({ action: 'account.create', details: { name: 'Ops', type: 'bank', openingBalance: 500000 } }))
    .toBe('Ops (bank), opening balance ₦5,000.00');
  expect(describeActivity({ action: 'account.update', details: { name: 'Ops', changes: { active: true, openingBalance: 100 } } }))
    .toBe('Ops: reactivated, opening balance ₦1.00');
  expect(describeActivity({ action: 'auth.login', details: { email: 'a@b.com' } })).toBe('a@b.com');
});

test('describes role changes in words', () => {
  expect(actionLabel('role.create')).toBe('Created role');
  expect(actionLabel('role.update')).toBe('Changed role');
  expect(actionLabel('role.delete')).toBe('Deleted role');
  expect(describeActivity({ action: 'role.create', details: { name: 'Front Desk', permissions: ['income.view', 'income.record'] } }))
    .toBe('Front Desk, 2 permissions');
  expect(describeActivity({ action: 'role.create', details: { name: 'Viewer', permissions: ['income.view'] } }))
    .toBe('Viewer, 1 permission');
  expect(describeActivity({ action: 'role.update', details: { name: 'Records clerk', changes: { name: 'Records clerk', permissions: ['a', 'b', 'c'] } } }))
    .toBe('Records clerk: name → Records clerk, 3 permissions');
  expect(describeActivity({ action: 'role.update', details: { name: 'Cashier', changes: { description: 'New words' } } }))
    .toBe('Cashier: description changed');
  expect(describeActivity({ action: 'role.delete', details: { name: 'Front Desk' } })).toBe('Front Desk');
});

test('describes category changes', () => {
  expect(actionLabel('category.add')).toBe('Added category');
  expect(actionLabel('category.update')).toBe('Changed category');
  expect(describeActivity({ action: 'category.add', details: { level: 'item', path: ['Recurrent', 'Security', 'Night guards'] } }))
    .toBe('item: Recurrent › Security › Night guards');
  expect(describeActivity({ action: 'category.add', details: { level: 'category', path: ['Research'] } })).toBe('category: Research');
  expect(describeActivity({ action: 'category.update', details: { path: ['Capital', 'Equipment', 'Nursing'], active: false } }))
    .toBe('Capital › Equipment › Nursing hidden');
  expect(describeActivity({ action: 'category.update', details: { path: ['Capital'], active: true } })).toBe('Capital shown again');
});

test('unknown or empty details give an empty description', () => {
  expect(describeActivity({ action: 'something.new', details: { x: 1 } })).toBe('');
  expect(describeActivity({ action: 'income.create' })).toBe('');
});
