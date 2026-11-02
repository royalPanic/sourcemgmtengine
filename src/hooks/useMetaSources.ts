import { useCallback, useEffect, useState } from 'react';
import { metaSourcesApi } from '../api/tauri';
import type { MetaSourceSummary, MetaSourceKind } from '../types';

/**
 * The global list of meta sources — the people and organisations that sources
 * report on. Shared across every case, so this is loaded once per window rather
 * than per selection.
 */
export function useMetaSources() {
  const [metaSources, setMetaSources] = useState<MetaSourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetaSources = useCallback(async () => {
    try {
      setLoading(true);
      const data = await metaSourcesApi.getAll();
      setMetaSources(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meta sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetaSources();
  }, [loadMetaSources]);

  const createMetaSource = async (params: {
    name: string;
    kind?: MetaSourceKind;
    description?: string;
    url?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => {
    const created = await metaSourcesApi.create(params);
    // Reload rather than prepend: the list carries citation counts, which the
    // create response cannot know.
    await loadMetaSources();
    return created;
  };

  const updateMetaSource = async (id: string, params: Partial<{
    name: string;
    kind: MetaSourceKind;
    description: string;
    url: string;
    reliabilityCode: string;
    credibilityCode: number;
  }>) => {
    const updated = await metaSourcesApi.update(id, params);
    await loadMetaSources();
    return updated;
  };

  const deleteMetaSource = async (id: string) => {
    await metaSourcesApi.delete(id);
    await loadMetaSources();
  };

  return {
    metaSources,
    loading,
    error,
    loadMetaSources,
    createMetaSource,
    updateMetaSource,
    deleteMetaSource,
  };
}
