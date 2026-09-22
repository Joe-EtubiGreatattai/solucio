import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';

export function useAccounts({ activeOnly = true } = {}) {
  const live = useLiveRefresh(['accounts']);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/accounts', activeOnly ? { active: 'true' } : {}).then(setAccounts).catch((e) => { setAccounts([]); setError(e.message || 'Could not load accounts'); });
  }, [activeOnly, live]);
  return { accounts, error };
}
