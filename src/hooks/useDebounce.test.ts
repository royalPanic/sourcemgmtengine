import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave, useDebouncedCallback } from './useDebounce';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires once per burst', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('c');
  });

  it('flushes the pending call on unmount', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('last edit');
    });

    expect(callback).not.toHaveBeenCalled();

    unmount();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('last edit');
  });

  it('does not fire after unmount when nothing was pending', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    unmount();

    expect(callback).not.toHaveBeenCalled();
  });

  it('flush() runs the pending call immediately', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('now');
      result.current.flush();
    });

    expect(callback).toHaveBeenCalledWith('now');
  });
});

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves the latest value after the debounce window', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave<string>(saveFn, 500));

    act(() => {
      result.current('first');
      result.current('second');
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('second');
  });

  it('flushes a pending debounce on unmount', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoSave<string>(saveFn, 500));

    act(() => {
      result.current('unsaved edit');
    });

    expect(saveFn).not.toHaveBeenCalled();

    unmount();

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('unsaved edit');
  });

  it('writes a value that arrived while a save was in flight', async () => {
    // A controllable promise stands in for the in-flight save, so the test does
    // not depend on how fake timers interleave with promise callbacks.
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const saveFn = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave<string>(saveFn, 500));

    // Everything happens inside one act block: the first save starts and is
    // still pending, then a second value arrives and must be held rather than
    // written concurrently.
    await act(async () => {
      result.current('in-flight');
      vi.advanceTimersByTime(500);
      await Promise.resolve();

      expect(saveFn).toHaveBeenCalledTimes(1);

      result.current('queued');
      vi.advanceTimersByTime(500);
      await Promise.resolve();

      // Still one call: the second value is parked behind the first save.
      expect(saveFn).toHaveBeenCalledTimes(1);

      // Releasing the first save drains the held value.
      releaseFirst();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledWith('in-flight');
    expect(saveFn).toHaveBeenCalledWith('queued');
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it('flushes a value held behind an in-flight save on unmount', async () => {
    // The first save never settles, so the second value stays parked until the
    // unmount flush writes it.
    const saveFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>(() => {}))
      .mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoSave<string>(saveFn, 500));

    act(() => {
      result.current('in-flight');
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    act(() => {
      result.current('held');
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledTimes(1);

    unmount();

    // The held value is written even though the component is gone.
    expect(saveFn).toHaveBeenCalledWith('held');
  });

  it('does not produce an unhandled rejection when the save fails', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('disk full'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAutoSave<string>(saveFn, 500));

    act(() => {
      result.current('value');
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});