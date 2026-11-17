import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityTypes } from './useEntityTypes';
import { entitiesApi } from '../api/tauri';
import type { EntityType } from '../types';

vi.mock('../api/tauri', () => ({
  entitiesApi: {
    getAll: vi.fn(),
    createType: vi.fn(),
    updateType: vi.fn(),
    deleteType: vi.fn(),
  },
}));

const mockEntitiesApi = entitiesApi as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  createType: ReturnType<typeof vi.fn>;
  updateType: ReturnType<typeof vi.fn>;
  deleteType: ReturnType<typeof vi.fn>;
};

const mockType: EntityType = {
  id: 'type-1',
  name: 'Person',
  description: 'A person entity',
  default_qualities: [
    { name: 'Nationality', type: 'string', required: true },
    { name: 'Date of Birth', type: 'date', required: false },
  ],
  is_builtin: true,
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

  it('appends a created type in name order', async () => {
    mockEntitiesApi.getAll.mockResolvedValue([mockType]);
    mockEntitiesApi.createType.mockResolvedValue({
      id: 'type-2',
      name: 'Aircraft',
      description: null,
      default_qualities: [],
      is_builtin: false,
    });

    const { result } = renderHook(() => useEntityTypes());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.createType({ id: 'type-2', name: 'Aircraft' });
    });

    expect(result.current.types.map(t => t.name)).toEqual(['Aircraft', 'Person']);
  });

  it('replaces an updated type in place', async () => {
    mockEntitiesApi.getAll.mockResolvedValue([mockType]);
    mockEntitiesApi.updateType.mockResolvedValue({ ...mockType, name: 'Human' });

    const { result } = renderHook(() => useEntityTypes());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateType('type-1', { name: 'Human' });
    });

    expect(result.current.types).toHaveLength(1);
    expect(result.current.types[0]!.name).toBe('Human');
  });

  it('removes a deleted type from the list', async () => {
    mockEntitiesApi.getAll.mockResolvedValue([mockType]);
    mockEntitiesApi.deleteType.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEntityTypes());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteType('type-1');
    });

    expect(result.current.types).toEqual([]);
  });

  it('propagates a create failure to the caller', async () => {
    mockEntitiesApi.getAll.mockResolvedValue([]);
    mockEntitiesApi.createType.mockRejectedValue(new Error('already exists'));

    const { result } = renderHook(() => useEntityTypes());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await expect(
      result.current.createType({ id: 'person', name: 'Person' })
    ).rejects.toThrow('already exists');

    // The list is untouched, so the designer can retry.
    expect(result.current.types).toEqual([]);
  });
});
