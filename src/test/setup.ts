import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(() => Promise.resolve(true)),
}));

// jsdom does not expose a usable localStorage here (Node's own global shadows
// it), so install a minimal in-memory implementation for tests that persist
// view preferences. Defining it unconditionally also stops Node from emitting
// its "localStorage is not available" warning on every test file.
{
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
