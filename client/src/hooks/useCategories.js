import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';

export function useCategories() {
  const live = useLiveRefresh(['categories']);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/categories').then(setCategories).catch((e) => { setCategories([]); setError(e.message || 'Could not load categories'); });
  }, [live]);
  return { categories, error };
}
