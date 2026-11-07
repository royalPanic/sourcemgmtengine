import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.confirm globally so tests don't hang on native dialogs.
vi.stubGlobal('confirm', vi.fn(() => true));

// Mock ResizeObserver for SourceMap tests.
class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserver);
