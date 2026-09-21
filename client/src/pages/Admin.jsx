import { useState } from 'react';
import UsersAdmin from './admin/UsersAdmin';
import AccountsAdmin from './admin/AccountsAdmin';

export default function Admin() {
  const [tab, setTab] = useState('accounts');
  return (
    <>
      <h2>Admin</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'accounts' ? '' : 'secondary'} onClick={() => setTab('accounts')}>Accounts</button>
        <button className={tab === 'users' ? '' : 'secondary'} onClick={() => setTab('users')}>Users</button>
      </div>
      {tab === 'accounts' ? <AccountsAdmin /> : <UsersAdmin />}
    </>
  );
}
