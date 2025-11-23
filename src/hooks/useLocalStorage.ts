"use client"

import { useEffect, useState } from "react"

export const useLocalStorage = <T extends Record<string, any>>(key: string, defaultValue = {}): [T, (v: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  })

  const storeValue = (v: T) => {
    localStorage.setItem(key, JSON.stringify(v))
    setValue(v)
  }

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        setValue(e.newValue ? JSON.parse(e.newValue) : defaultValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return [value, storeValue]
}
