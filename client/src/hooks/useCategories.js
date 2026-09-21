import { useEffect, useState } from 'react';
import { api } from '../api';

export function useCategories() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  return categories;
}
