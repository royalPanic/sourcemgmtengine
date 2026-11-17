import { useState, useEffect, useCallback } from 'react';
import { entitiesApi, qualitiesApi } from '../api/tauri';
import type { Entity, EntityQualityWithRefs, QualityType } from '../types';

export function useEntities(caseId: string | null, isGlobal?: boolean) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await entitiesApi.getEntities(caseId ?? undefined, isGlobal);
      setEntities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [caseId, isGlobal]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const createEntity = async (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }) => {
    const created = await entitiesApi.createEntity(params);
    setEntities(prev => [created, ...prev]);
    return created;
  };

  const updateEntity = async (id: string, params: Partial<{
    name: string;
    description: string;
    caseId: string;
    isGlobal: boolean;
  }>) => {
    const updated = await entitiesApi.updateEntity(id, params);
    setEntities(prev => prev.map(e => (e.id === id ? updated : e)));
    return updated;
  };

  const deleteEntity = async (id: string) => {
    await entitiesApi.deleteEntity(id);
    setEntities(prev => prev.filter(e => e.id !== id));
  };

  return {
    entities,
    loading,
    error,
    loadEntities,
    createEntity,
    updateEntity,
    deleteEntity,
  };
}

export function useEntityQualities(entityId: string | null) {
  const [qualities, setQualities] = useState<EntityQualityWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQualities = useCallback(async () => {
    if (!entityId) {
      setQualities([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await qualitiesApi.getAll(entityId);
      setQualities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load qualities');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    loadQualities();
  }, [loadQualities]);

  const createQuality = async (params: {
    entityId: string;
    qualityName: string;
    qualityType: QualityType;
    valueString?: string | null;
    valueInteger?: number | null;
    valueBoolean?: boolean | null;
    valueDate?: string | null;
    valueCoordinates?: string | null;
    valueAddress?: string | null;
  }) => {
    const created = await qualitiesApi.create({
      entityId: params.entityId,
      qualityName: params.qualityName,
      qualityType: params.qualityType,
      valueString: params.valueString ?? undefined,
      valueInteger: params.valueInteger ?? undefined,
      valueBoolean: params.valueBoolean ?? undefined,
      valueDate: params.valueDate ?? undefined,
      valueCoordinates: params.valueCoordinates ?? undefined,
      valueAddress: params.valueAddress ?? undefined,
    });
    // Reload so source_refs (if any) are populated and the list stays in sync.
    await loadQualities();
    return created;
  };

  const updateQuality = async (id: string, params: Partial<{
    qualityName: string;
    qualityType: QualityType;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => {
    const updated = await qualitiesApi.update(id, {
      qualityName: params.qualityName ?? undefined,
      qualityType: params.qualityType ?? undefined,
      valueString: params.valueString,
      valueInteger: params.valueInteger,
      valueBoolean: params.valueBoolean,
      valueDate: params.valueDate,
      valueCoordinates: params.valueCoordinates,
      valueAddress: params.valueAddress,
    });
    await loadQualities();
    return updated;
  };

  const deleteQuality = async (id: string) => {
    await qualitiesApi.delete(id);
    await loadQualities();
  };

  return {
    qualities,
    loading,
    error,
    loadQualities,
    createQuality,
    updateQuality,
    deleteQuality,
  };
}