import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.confirm globally so tests don't hang on native dialogs.
vi.stubGlobal('confirm', vi.fn(() => true));

// jsdom does not expose a usable localStorage here (Node's own global shadows
// it), so install a minimal in-memory implementation for tests that persist
// view preferences.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

// Mock ResizeObserver for SourceMap tests.
class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserver);
