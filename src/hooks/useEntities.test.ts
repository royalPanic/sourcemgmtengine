import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntities, useEntityQualities } from './useEntities';
import { entitiesApi, qualitiesApi } from '../api/tauri';
import type { Entity, EntityQualityWithRefs } from '../types';

vi.mock('../api/tauri', () => ({
  entitiesApi: {
    getEntities: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    getAll: vi.fn(),
  },
  qualitiesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockEntitiesApi = entitiesApi as unknown as {
  getEntities: ReturnType<typeof vi.fn>;
  createEntity: ReturnType<typeof vi.fn>;
  updateEntity: ReturnType<typeof vi.fn>;
  deleteEntity: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
};

const mockQualitiesApi = qualitiesApi as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockEntity: Entity = {
  id: 'entity-1',
  entity_type: 'person',
  name: 'John Doe',
  description: 'A test entity',
  case_id: 'case-1',
  is_global: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockQuality: EntityQualityWithRefs = {
  id: 'quality-1',
  entity_id: 'entity-1',
  quality_name: 'Nationality',
  quality_type: 'string',
  value_string: 'American',
  value_integer: null,
  value_boolean: null,
  value_date: null,
  value_coordinates: null,
  value_address: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  source_refs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEntities', () => {
  it('loads entities for a case', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);

    const { result } = renderHook(() => useEntities('case-1', false));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.entities).toEqual([mockEntity]);
    expect(result.current.error).toBeNull();
  });

  it('loads global entities when isGlobal is true', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);

    const { result } = renderHook(() => useEntities(null, true));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockEntitiesApi.getEntities).toHaveBeenCalledWith(undefined, true);
    expect(result.current.entities).toEqual([mockEntity]);
  });

  it('passes the container id with no global filter for the Entities panel', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);

    // The panel scopes by container so globals and case-specific rows arrive
    // together; the backend decides what a container view includes.
    const { result } = renderHook(() => useEntities('case-1', undefined));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockEntitiesApi.getEntities).toHaveBeenCalledWith('case-1', undefined);
    expect(result.current.entities).toEqual([mockEntity]);
  });

  it('scopes by container without forcing globals-only', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);

    // App calls the hook with just the container id. Passing `isGlobal = true`
    // here is what previously hid every case-specific entity from the workspace
    // tabs and the source reference picker.
    const { result } = renderHook(() => useEntities('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockEntitiesApi.getEntities).toHaveBeenCalledWith('case-1', undefined);
    expect(mockEntitiesApi.getEntities).not.toHaveBeenCalledWith('case-1', true);
    expect(result.current.entities).toEqual([mockEntity]);
  });

  it('handles load errors', async () => {
    mockEntitiesApi.getEntities.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useEntities('case-1', false));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Load failed');
  });

  it('creates an entity and prepends it', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([]);
    mockEntitiesApi.createEntity.mockResolvedValue(mockEntity);

    const { result } = renderHook(() => useEntities('case-1', false));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.createEntity({
        entityType: 'person',
        name: 'John Doe',
        description: 'A test entity',
        caseId: 'case-1',
        isGlobal: false,
      });
    });

    expect(mockEntitiesApi.createEntity).toHaveBeenCalledWith({
      entityType: 'person',
      name: 'John Doe',
      description: 'A test entity',
      caseId: 'case-1',
      isGlobal: false,
    });
    expect(result.current.entities).toEqual([mockEntity]);
  });

  it('updates an entity in place', async () => {
    const updated = { ...mockEntity, name: 'Jane Doe' };
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);
    mockEntitiesApi.updateEntity.mockResolvedValue(updated);

    const { result } = renderHook(() => useEntities('case-1', false));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateEntity('entity-1', { name: 'Jane Doe' });
    });

    expect(mockEntitiesApi.updateEntity).toHaveBeenCalledWith('entity-1', {
      name: 'Jane Doe',
      description: undefined,
      caseId: undefined,
      isGlobal: undefined,
    });
    expect(result.current.entities).toEqual([updated]);
  });

  it('deletes an entity from the list', async () => {
    mockEntitiesApi.getEntities.mockResolvedValue([mockEntity]);
    mockEntitiesApi.deleteEntity.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEntities('case-1', false));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteEntity('entity-1');
    });

    expect(mockEntitiesApi.deleteEntity).toHaveBeenCalledWith('entity-1');
    expect(result.current.entities).toEqual([]);
  });
});

describe('useEntityQualities', () => {
  it('loads qualities for an entity', async () => {
    mockQualitiesApi.getAll.mockResolvedValue([mockQuality]);

    const { result } = renderHook(() => useEntityQualities('entity-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.qualities).toEqual([mockQuality]);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty when no entityId', () => {
    const { result } = renderHook(() => useEntityQualities(null));

    expect(result.current.qualities).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('creates a quality and appends it', async () => {
    const created = { ...mockQuality, id: 'quality-new' };
    mockQualitiesApi.getAll.mockResolvedValue([mockQuality, created]);
    mockQualitiesApi.create.mockResolvedValue(created);

    const { result } = renderHook(() => useEntityQualities('entity-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.createQuality({
        entityId: 'entity-1',
        qualityName: 'Nationality',
        qualityType: 'string',
        valueString: 'American',
      });
    });

    expect(mockQualitiesApi.create).toHaveBeenCalledWith({
      entityId: 'entity-1',
      qualityName: 'Nationality',
      qualityType: 'string',
      valueString: 'American',
      valueInteger: undefined,
      valueBoolean: undefined,
      valueDate: undefined,
      valueCoordinates: undefined,
      valueAddress: undefined,
    });
    expect(result.current.qualities).toHaveLength(2);
  });

  it('updates a quality in place', async () => {
    const updated = { ...mockQuality, value_string: 'British' };
    mockQualitiesApi.getAll.mockResolvedValue([updated]);
    mockQualitiesApi.update.mockResolvedValue(updated);

    const { result } = renderHook(() => useEntityQualities('entity-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateQuality('quality-1', { valueString: 'British' });
    });

    expect(mockQualitiesApi.update).toHaveBeenCalledWith('quality-1', {
      qualityName: undefined,
      qualityType: undefined,
      valueString: 'British',
      valueInteger: undefined,
      valueBoolean: undefined,
      valueDate: undefined,
      valueCoordinates: undefined,
      valueAddress: undefined,
    });
    expect(result.current.qualities).toEqual([updated]);
  });

  it('passes explicit nulls through so quality values can be cleared', async () => {
    mockQualitiesApi.getAll.mockResolvedValue([]);
    mockQualitiesApi.update.mockResolvedValue({ ...mockQuality, value_string: null });

    const { result } = renderHook(() => useEntityQualities('entity-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateQuality('quality-1', { valueString: null });
    });

    expect(mockQualitiesApi.update).toHaveBeenCalledWith('quality-1', {
      qualityName: undefined,
      qualityType: undefined,
      valueString: null,
      valueInteger: undefined,
      valueBoolean: undefined,
      valueDate: undefined,
      valueCoordinates: undefined,
      valueAddress: undefined,
    });
  });

  it('deletes a quality from the list', async () => {
    mockQualitiesApi.getAll.mockResolvedValue([]);
    mockQualitiesApi.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEntityQualities('entity-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteQuality('quality-1');
    });

    expect(mockQualitiesApi.delete).toHaveBeenCalledWith('quality-1');
    expect(result.current.qualities).toEqual([]);
  });
});
