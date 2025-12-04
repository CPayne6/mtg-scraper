"use client"

import { useEffect, useState } from "react"

export const useLocalStorage = <T extends Record<string, any>>(key: string, defaultValue: T): [T, (v: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    try {
      const storageValue = localStorage.getItem(key)
      return storageValue && storageValue.length > 0 ? JSON.parse(storageValue) : defaultValue
    }
    catch(err){
      return defaultValue
    }
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

    const stored = localStorage.getItem(key)
    if (stored) {
      setValue(JSON.parse(stored))
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return [value, storeValue]
}
