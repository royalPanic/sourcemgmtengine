import { useState, useEffect, useCallback } from 'react';
import { entitiesApi } from '../api/tauri';
import type { EntityType, EntityTypeQuality } from '../types';

export function useEntityTypes() {
  const [types, setTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await entitiesApi.getAll();
      setTypes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const createType = async (params: {
    id: string;
    name: string;
    description?: string;
    defaultQualities?: EntityTypeQuality[];
  }) => {
    const created = await entitiesApi.createType(params);
    // Keep the order the backend returns, so a new type does not jump to a
    // different position until the next reload.
    setTypes(prev =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    return created;
  };

  const updateType = async (id: string, params: Partial<{
    name: string;
    description: string;
    defaultQualities: EntityTypeQuality[];
  }>) => {
    const updated = await entitiesApi.updateType(id, params);
    setTypes(prev =>
      prev
        .map(t => (t.id === id ? updated : t))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    return updated;
  };

  const deleteType = async (id: string) => {
    await entitiesApi.deleteType(id);
    setTypes(prev => prev.filter(t => t.id !== id));
  };

  return {
    types,
    loading,
    error,
    loadTypes,
    createType,
    updateType,
    deleteType,
  };
}