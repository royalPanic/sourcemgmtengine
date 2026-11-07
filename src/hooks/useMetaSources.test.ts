import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMetaSources } from './useMetaSources';
import { metaSourcesApi } from '../api/tauri';
import type { MetaSource, MetaSourceSummary, MetaSourceKind } from '../types';

vi.mock('../api/tauri', () => ({
  metaSourcesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockMetaSourcesApi = metaSourcesApi as ReturnType<typeof vi.fn> & {
  getAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockMetaSource: MetaSource = {
  id: 'meta-1',
  name: 'Reuters',
  kind: 'organization',
  description: 'News agency',
  url: 'https://reuters.com',
  reliability_code: 'A',
  credibility_code: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockMetaSourceSummary: MetaSourceSummary = {
  ...mockMetaSource,
  citation_count: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMetaSources', () => {
  it('loads meta sources on mount', async () => {
    mockMetaSourcesApi.getAll.mockResolvedValue([mockMetaSourceSummary]);

    const { result } = renderHook(() => useMetaSources());

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.metaSources).toEqual([mockMetaSourceSummary]);
    expect(result.current.error).toBeNull();
  });

  it('handles load errors', async () => {
    mockMetaSourcesApi.getAll.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useMetaSources());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Load failed');
  });

  it('creates a meta source and reloads', async () => {
    mockMetaSourcesApi.getAll.mockResolvedValue([]);
    mockMetaSourcesApi.create.mockResolvedValue(mockMetaSource);
    mockMetaSourcesApi.getAll.mockResolvedValueOnce([mockMetaSourceSummary]);

    const { result } = renderHook(() => useMetaSources());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.createMetaSource({
        name: 'Reuters',
        kind: 'organization',
        description: 'News agency',
        url: 'https://reuters.com',
        reliabilityCode: 'A',
        credibilityCode: 1,
      });
    });

    expect(mockMetaSourcesApi.create).toHaveBeenCalledWith({
      name: 'Reuters',
      kind: 'organization',
      description: 'News agency',
      url: 'https://reuters.com',
      reliabilityCode: 'A',
      credibilityCode: 1,
    });
    expect(mockMetaSourcesApi.getAll).toHaveBeenCalledTimes(2);
  });

  it('updates a meta source and reloads', async () => {
    const updated = { ...mockMetaSource, name: 'Updated News' };
    mockMetaSourcesApi.getAll.mockResolvedValue([mockMetaSourceSummary]);
    mockMetaSourcesApi.update.mockResolvedValue(updated);
    mockMetaSourcesApi.getAll.mockResolvedValueOnce([{ ...mockMetaSourceSummary, name: 'Updated News', citation_count: 3 }]);

    const { result } = renderHook(() => useMetaSources());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateMetaSource('meta-1', { name: 'Updated News' });
    });

    expect(mockMetaSourcesApi.update).toHaveBeenCalledWith('meta-1', {
      name: 'Updated News',
      kind: undefined,
      description: undefined,
      url: undefined,
      reliabilityCode: undefined,
      credibilityCode: undefined,
    });
  });

  it('deletes a meta source and reloads', async () => {
    // First call: initial load returns one item
    // Second call: reload after delete returns empty
    mockMetaSourcesApi.getAll
      .mockResolvedValueOnce([mockMetaSourceSummary])
      .mockResolvedValueOnce([]);
    mockMetaSourcesApi.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMetaSources());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.metaSources).toEqual([mockMetaSourceSummary]);

    await act(async () => {
      await result.current.deleteMetaSource('meta-1');
    });

    expect(mockMetaSourcesApi.delete).toHaveBeenCalledWith('meta-1');
    // Wait for the reload to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.metaSources).toEqual([]);
  });
});
