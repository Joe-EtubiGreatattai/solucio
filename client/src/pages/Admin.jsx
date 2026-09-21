import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import UsersAdmin from './admin/UsersAdmin';
import AccountsAdmin from './admin/AccountsAdmin';
import CategoriesAdmin from './admin/CategoriesAdmin';
import RolesAdmin from './admin/RolesAdmin';

export default function Admin() {
  const { can, isAdmin } = useAuth();
  // Each tab shows only for people whose role allows it. Changing roles is for admins alone.
  const tabs = [
    can('users.manage') && { id: 'users', label: 'Users', screen: <UsersAdmin /> },
    can('accounts.manage') && { id: 'accounts', label: 'Accounts', screen: <AccountsAdmin /> },
    can('categories.manage') && { id: 'categories', label: 'Categories', screen: <CategoriesAdmin /> },
    isAdmin && { id: 'roles', label: 'Roles', screen: <RolesAdmin /> },
  ].filter(Boolean);
  const [chosen, setChosen] = useState(null);
  const active = tabs.find((t) => t.id === chosen) || tabs[0];
  if (!active) return <p className="error">You are not allowed to view this page.</p>;
  return (
    <>
      <h1>Admin</h1>
      <div className="row tabs" role="tablist" aria-label="Admin sections" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t === active}
            className={t === active ? '' : 'secondary'}
            onClick={() => setChosen(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{active.screen}</div>
    </>
  );
}
