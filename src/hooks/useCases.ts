import { useState, useEffect, useCallback, useRef } from 'react';
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

  const createCase = async (params: {
    title: string;
    description?: string;
    eventDate?: string;
    eventTime?: string;
  }) => {
    const newCase = await casesApi.create(params);
    setCases(prev => [newCase, ...prev]);
    return newCase;
  };

  const updateCase = async (id: string, params: Partial<{
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
  }>) => {
    const updated = await casesApi.update(id, params);
    setCases(prev => prev.map(c => (c.id === id ? updated : c)));
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
  const requestIdRef = useRef(0);
  const activeCaseIdRef = useRef(caseId);
  activeCaseIdRef.current = caseId;

  const loadNote = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!caseId) {
      setNote(null);
      setLoading(false);
      setSaving(false);
      return;
    }
    try {
      setLoading(true);
      const data = await casesApi.getNote(caseId);
      if (requestId === requestIdRef.current) {
        setNote(data);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        console.error('Failed to load note:', err);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setSaving(false);
      }
    }
  }, [caseId]);

  useEffect(() => {
    void loadNote();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadNote]);

  const saveNote = async (content: string) => {
    const saveCaseId = caseId;
    if (!saveCaseId) return;
    try {
      if (activeCaseIdRef.current === saveCaseId) {
        setSaving(true);
      }
      const saved = await casesApi.updateNote(saveCaseId, content);
      if (activeCaseIdRef.current === saveCaseId) {
        setNote(saved);
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      throw err;
    } finally {
      if (activeCaseIdRef.current === saveCaseId) {
        setSaving(false);
      }
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