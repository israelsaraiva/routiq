import { useCallback, useState } from 'react';

function readNumber(key: string, fallback: number): number {
  try {
    const parsed = Number(window.localStorage.getItem(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    return;
  }
}

export function useStoredNumber(key: string, fallback: number): [number, (value: number) => void] {
  const [stored, setStored] = useState(() => readNumber(key, fallback));
  const update = useCallback(
    (value: number) => {
      setStored(value);
      writeNumber(key, value);
    },
    [key],
  );
  return [stored, update];
}
