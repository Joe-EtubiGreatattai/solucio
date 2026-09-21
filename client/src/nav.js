const FIN = ['accountant', 'admin'];
export const NAV = [
  { to: '/', label: 'Dashboard', roles: FIN },
  { to: '/income', label: 'Income', roles: ['cashier', 'accountant', 'admin'] },
  { to: '/expenses', label: 'Expenses', roles: FIN },
  { to: '/reports', label: 'Reports', roles: FIN },
  { to: '/admin', label: 'Admin', roles: ['admin'] },
];
export const visibleNav = (role) => NAV.filter((i) => i.roles.includes(role));
