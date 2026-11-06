import { useState, useEffect, useCallback } from 'react';
import { entitiesApi } from '../api/tauri';
import type { EntityType } from '../types';

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

  return {
    types,
    loading,
    error,
    loadTypes,
  };
}