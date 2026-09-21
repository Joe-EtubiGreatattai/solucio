import { useEffect, useState } from 'react';
import { api } from '../api';

export function useAccounts({ activeOnly = true } = {}) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/accounts', activeOnly ? { active: 'true' } : {}).then(setAccounts).catch((e) => { setAccounts([]); setError(e.message || 'Could not load accounts'); });
  }, [activeOnly]);
  return { accounts, error };
}
