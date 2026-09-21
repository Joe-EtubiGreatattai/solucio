import { useEffect, useState } from 'react';
import { api } from '../api';

export function useAccounts({ activeOnly = true } = {}) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.get('/accounts', activeOnly ? { active: 'true' } : {}).then(setAccounts).catch(() => setAccounts([]));
  }, [activeOnly]);
  return accounts;
}
