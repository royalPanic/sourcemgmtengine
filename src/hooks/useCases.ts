import { useState, useEffect, useCallback } from 'react';
import { casesApi } from '../api/tauri';
import type { Case, CaseNote } from '../types';

export function useCases() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await casesApi.getAll();
      setCases(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const createCase = async (title: string, description?: string) => {
    const newCase = await casesApi.create(title, description);
    setCases(prev => [newCase, ...prev]);
    return newCase;
  };

  const updateCase = async (id: string, title?: string, description?: string) => {
    const updated = await casesApi.update(id, title, description);
    setCases(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  };

  const deleteCase = async (id: string) => {
    await casesApi.delete(id);
    setCases(prev => prev.filter(c => c.id !== id));
  };

  return {
    cases,
    loading,
    error,
    loadCases,
    createCase,
    updateCase,
    deleteCase,
  };
}

export function useCaseNote(caseId: string | null) {
  const [note, setNote] = useState<CaseNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadNote = useCallback(async () => {
    if (!caseId) return;
    try {
      setLoading(true);
      const data = await casesApi.getNote(caseId);
      setNote(data);
    } catch (err) {
      console.error('Failed to load note:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  const saveNote = async (content: string) => {
    if (!caseId) return;
    try {
      setSaving(true);
      const saved = await casesApi.updateNote(caseId, content);
      setNote(saved);
    } catch (err) {
      console.error('Failed to save note:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return {
    note,
    loading,
    saving,
    saveNote,
    refresh: loadNote,
  };
}