import { useCallback, useRef, useEffect } from 'react';

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number
): (...args: A) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: A) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

export function useAutoSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay: number = 500
): (data: T) => void {
  const pendingRef = useRef<T | null>(null);
  const savingRef = useRef(false);
  const debouncedSaveRef = useRef<((data: T) => void) | null>(null);

  const debouncedSave = useDebouncedCallback<[T]>(async (data) => {
    if (savingRef.current) {
      pendingRef.current = data;
      return;
    }

    savingRef.current = true;
    try {
      await saveFn(data);
    } finally {
      savingRef.current = false;
      if (pendingRef.current !== null) {
        const next = pendingRef.current;
        pendingRef.current = null;
        debouncedSaveRef.current?.(next);
      }
    }
  }, delay);

  debouncedSaveRef.current = debouncedSave;

  return debouncedSave;
}