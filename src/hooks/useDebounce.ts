import { useCallback, useRef, useEffect } from 'react';

/** A debounced function plus an explicit way to run its pending call now. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Runs the pending invocation immediately, if there is one. */
  flush(): void;
}

/**
 * A debounced callback that fires its pending invocation on unmount.
 *
 * The flush matters because callers use this to schedule writes: dropping the
 * last keystroke when a component unmounts (for example when the notes editor
 * is remounted with a new `key` after switching cases) loses data the operator
 * believes was saved.
 *
 * `onFlush` lets a caller intercept the flush — `useAutoSave` uses it to hold a
 * value behind an in-flight save instead of writing it concurrently.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
  onFlush?: (...args: A) => void
): Debounced<A> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<A | null>(null);
  const callbackRef = useRef(callback);
  const onFlushRef = useRef(onFlush);

  useEffect(() => {
    callbackRef.current = callback;
    onFlushRef.current = onFlush;
  }, [callback, onFlush]);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const debounced = useCallback(
    (...args: A) => {
      clear();
      pendingArgsRef.current = args;
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending) {
          callbackRef.current(...pending);
        }
      }, delay);
    },
    [clear, delay]
  );

  const flush = useCallback(() => {
    clear();
    const pending = pendingArgsRef.current;
    pendingArgsRef.current = null;
    if (pending) {
      // A caller that needs to intercept the flush (to hold the value behind an
      // in-flight save) gets first refusal; otherwise the callback runs.
      if (onFlushRef.current) {
        onFlushRef.current(...pending);
      } else {
        callbackRef.current(...pending);
      }
    }
  }, [clear]);

  useEffect(() => {
    return flush;
  }, [flush]);

  // A stable wrapper object: the caller may invoke it directly or use `.flush`.
  // Built once so the identity does not churn between renders.
  const handleRef = useRef<Debounced<A> | null>(null);
  if (!handleRef.current) {
    const handle = ((...args: A) => debounced(...args)) as Debounced<A>;
    handle.flush = flush;
    handleRef.current = handle;
  }

  return handleRef.current;
}

/**
 * Debounces an async save, serialising overlapping calls.
 *
 * A value that arrives while a save is in flight is held in `pendingRef` and
 * written once the in-flight save settles. On unmount any held value is
 * flushed, so the last edit is never dropped.
 */
export function useAutoSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay: number = 500
): ((data: T) => void) & { flush: () => void } {
  const pendingRef = useRef<T | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const saveFnRef = useRef(saveFn);
  const debouncedSaveRef = useRef<Debounced<[T]> | null>(null);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Writes `data`, logging rather than throwing when the component is gone. */
  const write = useCallback((data: T) => {
    savingRef.current = true;
    void saveFnRef.current(data)
      .catch((err) => {
        // A rejection here cannot be surfaced through React state once the
        // component has unmounted, and an unhandled rejection is worse than a
        // logged one.
        console.error('Failed to save:', err);
      })
      .then(() => {
        // Drain the held value *before* clearing the flag: the re-entrant call
        // goes straight to `write` rather than back through the debounce, so
        // clearing first would park it forever.
        const next = pendingRef.current;
        pendingRef.current = null;
        savingRef.current = false;

        if (!mountedRef.current || next === null) return;
        write(next);
      });
  }, []);

  // A value that lands while a save is in flight is parked in `pendingRef`
  // rather than written, so the two never overlap. The same rule applies to a
  // flush, which is why `onFlush` mirrors the callback body.
  const enqueue = useCallback(
    (data: T) => {
      if (savingRef.current) {
        pendingRef.current = data;
        return;
      }
      write(data);
    },
    [write]
  );

  const debouncedSave = useDebouncedCallback<[T]>(enqueue, delay, enqueue);
  debouncedSaveRef.current = debouncedSave;

  const flush = useCallback(() => {
    debouncedSave.flush();

    if (pendingRef.current !== null) {
      const next = pendingRef.current;
      pendingRef.current = null;
      write(next);
    }
  }, [debouncedSave, write]);

  useEffect(() => {
    return flush;
  }, [flush]);

  const handleRef = useRef<((data: T) => void) & { flush: () => void } | null>(null);
  if (!handleRef.current) {
    const handle = ((data: T) => debouncedSave(data)) as ((data: T) => void) & {
      flush: () => void;
    };
    handle.flush = flush;
    handleRef.current = handle;
  }

  return handleRef.current;
}