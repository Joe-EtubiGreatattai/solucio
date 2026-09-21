// Each menu entry shows only when the signed-in person's role allows the page.
const any = (...permissions) => (access) => permissions.some((p) => access.can(p));

export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', allows: any('reports.view') },
  { to: '/income', label: 'Income', icon: 'income', allows: any('income.view', 'income.record') },
  { to: '/expenses', label: 'Expenses', icon: 'expenses', allows: any('expenses.view', 'expenses.record') },
  { to: '/statements', label: 'Bank statements', icon: 'statements', allows: any('statements.view', 'statements.import', 'statements.review', 'statements.approve') },
  { to: '/reports', label: 'Reports', icon: 'reports', allows: any('reports.view') },
  { to: '/activity', label: 'Activity', icon: 'activity', allows: any('activity.view') },
  { to: '/admin', label: 'Admin', icon: 'admin', allows: (access) => access.isAdmin || access.can('users.manage') || access.can('accounts.manage') || access.can('categories.manage') },
];
export const visibleNav = (access) => NAV.filter((item) => item.allows(access));
export const allowsPath = (to) => NAV.find((item) => item.to === to).allows;
