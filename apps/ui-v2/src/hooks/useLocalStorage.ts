import { useCallback, useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const read = useCallback((): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? defaultValue : (JSON.parse(raw) as T);
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked — ignore
    }
  }, [key, value]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // ignore malformed cross-tab updates
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, setValue] as const;
}
