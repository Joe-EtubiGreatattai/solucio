import { useEffect, useState } from 'react';
import { api } from '../api';

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/categories').then(setCategories).catch((e) => { setCategories([]); setError(e.message || 'Could not load categories'); });
  }, []);
  return { categories, error };
}
