import { useCallback, useState } from 'react';

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    return;
  }
}

export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [flag, setFlag] = useState(() => readFlag(key, fallback));
  const update = useCallback(
    (value: boolean) => {
      setFlag(value);
      writeFlag(key, value);
    },
    [key],
  );
  return [flag, update];
}
