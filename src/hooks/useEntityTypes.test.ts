import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityTypes } from './useEntityTypes';
import { entitiesApi } from '../api/tauri';
import type { EntityType } from '../types';

vi.mock('../api/tauri', () => ({
  entitiesApi: {
    getAll: vi.fn(),
  },
}));

const mockEntitiesApi = entitiesApi as unknown as {
  getAll: ReturnType<typeof vi.fn>;
};

const mockType: EntityType = {
  id: 'type-1',
  name: 'Person',
  description: 'A person entity',
  default_qualities: [
    { name: 'Nationality', type: 'string', required: true },
    { name: 'Date of Birth', type: 'date', required: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEntityTypes', () => {
  it('loads entity types on mount', async () => {
    mockEntitiesApi.getAll.mockResolvedValue([mockType]);

    const { result } = renderHook(() => useEntityTypes());

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.types).toEqual([mockType]);
    expect(result.current.error).toBeNull();
  });

  it('handles load errors', async () => {
    mockEntitiesApi.getAll.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useEntityTypes());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Load failed');
    expect(result.current.types).toEqual([]);
  });
});
