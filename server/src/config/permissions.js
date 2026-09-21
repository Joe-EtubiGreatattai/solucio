// The things a role can be allowed to do. The admin ticks these per role; the server checks them on every route.
const PERMISSIONS = [
  { key: 'income.view', label: 'View income and receipts', group: 'Income' },
  { key: 'income.record', label: 'Record income', group: 'Income' },
  { key: 'income.void', label: 'Void income', group: 'Income' },
  { key: 'expenses.view', label: 'View expenses', group: 'Expenses' },
  { key: 'expenses.record', label: 'Record expenses', group: 'Expenses' },
  { key: 'expenses.void', label: 'Void expenses', group: 'Expenses' },
  { key: 'reports.view', label: 'View the dashboard and reports', group: 'Reports' },
  { key: 'reports.export', label: 'Export reports', group: 'Reports' },
  { key: 'statements.view', label: 'View bank statements', group: 'Bank statements' },
  { key: 'statements.import', label: 'Import bank statements', group: 'Bank statements' },
  { key: 'statements.review', label: 'Review and categorize statement transactions', group: 'Bank statements' },
  { key: 'statements.approve', label: 'Approve reviewed statements', group: 'Bank statements' },
  { key: 'activity.view', label: 'View the activity log', group: 'Administration' },
  { key: 'accounts.manage', label: 'Manage accounts', group: 'Administration' },
  { key: 'categories.manage', label: 'Manage expense categories', group: 'Administration' },
  { key: 'users.manage', label: 'Manage users', group: 'Administration' },
];
const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const CASHIER = ['income.view', 'income.record', 'income.void'];
const ACCOUNTANT = [...CASHIER, 'expenses.view', 'expenses.record', 'expenses.void', 'reports.view', 'reports.export', 'statements.view', 'statements.import', 'statements.review'];

// The three roles every install starts with. Admin is locked: it always holds every permission.
const BUILT_IN_ROLES = [
  { key: 'cashier', name: 'Cashier', description: 'Records payments and prints receipts', permissions: CASHIER },
  { key: 'accountant', name: 'Accountant', description: 'Records payments and expenses and reads the reports', permissions: ACCOUNTANT },
  { key: 'admin', name: 'Admin', description: 'Full access. Manages users, roles and accounts', permissions: PERMISSION_KEYS },
];
const ADMIN_KEY = 'admin';

function permissionsForRole(role) {
  if (!role) return [];
  if (role.key === ADMIN_KEY) return [...PERMISSION_KEYS];
  return (role.permissions || []).filter((k) => PERMISSION_KEYS.includes(k));
}

module.exports = { PERMISSIONS, PERMISSION_KEYS, BUILT_IN_ROLES, ADMIN_KEY, permissionsForRole };
