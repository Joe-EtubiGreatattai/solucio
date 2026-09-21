import { useState } from 'react';

export function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  });

  const update = (next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  };

  return [value, update];
}
