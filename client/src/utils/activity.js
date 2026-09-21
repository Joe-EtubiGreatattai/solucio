import { formatNaira } from './money';

// What the server records in the audit log, in words a person would use.
export const ACTIONS = [
  { value: 'auth.login', label: 'Signed in' },
  { value: 'income.create', label: 'Recorded income' },
  { value: 'income.void', label: 'Voided income' },
  { value: 'expense.create', label: 'Recorded expense' },
  { value: 'expense.void', label: 'Voided expense' },
  { value: 'statement.import', label: 'Imported statement' },
  { value: 'statement.review', label: 'Reviewed statement transaction' },
  { value: 'statement.approve', label: 'Approved statement' },
  { value: 'user.create', label: 'Added user' },
  { value: 'user.update', label: 'Updated user' },
  { value: 'account.create', label: 'Added account' },
  { value: 'account.update', label: 'Updated account' },
  { value: 'category.add', label: 'Added category' },
  { value: 'category.update', label: 'Changed category' },
  { value: 'role.create', label: 'Created role' },
  { value: 'role.update', label: 'Changed role' },
  { value: 'role.delete', label: 'Deleted role' },
];

export const actionLabel = (action) => (ACTIONS.find((a) => a.value === action) || {}).label || action;

const join = (parts, sep) => parts.filter(Boolean).join(sep);
const money = (kobo) => (typeof kobo === 'number' ? formatNaira(kobo) : '');
const reason = (d) => (d.reason ? `Reason: ${d.reason}` : '');
const category = (d) => join([d.type, d.group, d.item], ' › ');

function changeText(changes = {}, passwordReset = false) {
  const parts = Object.entries(changes).map(([key, value]) => {
    if (key === 'active') return value ? 'reactivated' : 'deactivated';
    if (key === 'openingBalance') return `opening balance ${formatNaira(value)}`;
    return `${key} → ${value}`;
  });
  if (passwordReset) parts.push('password reset');
  return parts.join(', ');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function roleChangeText(changes = {}) {
  return Object.entries(changes).map(([key, value]) => {
    if (key === 'permissions') return plural(value.length, 'permission');
    if (key === 'description') return 'description changed';
    return `${key} → ${value}`;
  }).join(', ');
}

export function describeActivity(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'auth.login': return d.email || '';
    case 'income.create': return join([d.receiptNumber, money(d.amount)], ', ');
    case 'income.void': return join([join([d.receiptNumber, money(d.amount)], ', '), reason(d)], '. ');
    case 'expense.create': return join([category(d), money(d.amount)], ', ');
    case 'expense.void': return join([join([category(d), money(d.amount)], ', '), reason(d)], '. ');
    case 'statement.import': return join([d.fileName, d.account, plural(d.transactions || 0, 'transaction')], ', ');
    case 'statement.review': return join([d.fileName, d.category], ': ');
    case 'statement.approve': return join([d.fileName, plural(d.transactions || 0, 'transaction')], ', ');
    case 'user.create': return d.name ? `${d.name} (${d.email}) as ${d.role}` : '';
    case 'user.update': return join([d.name, changeText(d.changes, d.passwordReset)], ': ');
    case 'account.create': return d.name ? `${d.name} (${d.type}), opening balance ${money(d.openingBalance)}` : '';
    case 'account.update': return join([d.name, changeText(d.changes)], ': ');
    case 'category.add': return d.path ? `${d.level}: ${d.path.join(' › ')}` : '';
    case 'category.update': return d.path ? `${d.path.join(' › ')} ${d.active ? 'shown again' : 'hidden'}` : '';
    case 'role.create': return d.name ? `${d.name}, ${plural((d.permissions || []).length, 'permission')}` : '';
    case 'role.update': return join([d.name, roleChangeText(d.changes)], ': ');
    case 'role.delete': return d.name || '';
    default: return '';
  }
}
