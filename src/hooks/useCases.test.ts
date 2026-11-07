import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCases, useCaseNote } from './useCases';
import { casesApi } from '../api/tauri';
import type { Case, CaseNote } from '../types';

vi.mock('../api/tauri', () => ({
  casesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getNote: vi.fn(),
    updateNote: vi.fn(),
  },
}));

const mockCasesApi = casesApi as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  getNote: ReturnType<typeof vi.fn>;
  updateNote: ReturnType<typeof vi.fn>;
};

const mockCase: Case = {
  id: 'case-1',
  title: 'Test Case',
  description: 'A test case',
  kind: 'case',
  event_date: null,
  event_time: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockNote: CaseNote = {
  id: 'note-1',
  case_id: 'case-1',
  content: 'Test note content',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCases', () => {
  it('loads cases on mount', async () => {
    mockCasesApi.getAll.mockResolvedValue([mockCase]);

    const { result } = renderHook(() => useCases());

    expect(result.current.loading).toBe(true);
    expect(result.current.cases).toEqual([]);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.cases).toEqual([mockCase]);
    expect(result.current.error).toBeNull();
  });

  it('handles load errors', async () => {
    mockCasesApi.getAll.mockRejectedValue(new Error('Database error'));

    const { result } = renderHook(() => useCases());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Database error');
    expect(result.current.cases).toEqual([]);
  });

  it('creates a case and prepends it to the list', async () => {
    mockCasesApi.getAll.mockResolvedValue([]);
    mockCasesApi.create.mockResolvedValue(mockCase);

    const { result } = renderHook(() => useCases());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const newCase = await act(async () => {
      return await result.current.createCase({
        title: 'New Case',
        description: 'Description',
      });
    });

    expect(mockCasesApi.create).toHaveBeenCalledWith({
      title: 'New Case',
      description: 'Description',
      kind: undefined,
      eventDate: undefined,
      eventTime: undefined,
    });
    expect(newCase).toEqual(mockCase);
    expect(result.current.cases).toEqual([mockCase]);
  });

  it('updates a case in place', async () => {
    const updatedCase = { ...mockCase, title: 'Updated Case' };
    mockCasesApi.getAll.mockResolvedValue([mockCase]);
    mockCasesApi.update.mockResolvedValue(updatedCase);

    const { result } = renderHook(() => useCases());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateCase('case-1', { title: 'Updated Case' });
    });

    expect(mockCasesApi.update).toHaveBeenCalledWith('case-1', {
      title: 'Updated Case',
      description: undefined,
      eventDate: undefined,
      eventTime: undefined,
    });
    expect(result.current.cases).toEqual([updatedCase]);
  });

  it('deletes a case from the list', async () => {
    mockCasesApi.getAll.mockResolvedValue([mockCase]);
    mockCasesApi.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCases());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteCase('case-1');
    });

    expect(mockCasesApi.delete).toHaveBeenCalledWith('case-1');
    expect(result.current.cases).toEqual([]);
  });

  it('createCase throws when no case selected is not applicable (no caseId needed)', async () => {
    mockCasesApi.create.mockRejectedValue(new Error('Creation failed'));

    const { result } = renderHook(() => useCases());

    await expect(
      act(async () => {
        await result.current.createCase({ title: 'Bad' });
      })
    ).rejects.toThrow('Creation failed');
  });
});

describe('useCaseNote', () => {
  it('loads a case note on mount', async () => {
    mockCasesApi.getNote.mockResolvedValue(mockNote);

    const { result } = renderHook(() => useCaseNote('case-1'));

    expect(result.current.note).toBeNull();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.note).toEqual(mockNote);
    expect(result.current.loading).toBe(false);
  });

  it('returns null note when caseId is null', () => {
    const { result } = renderHook(() => useCaseNote(null));

    expect(result.current.note).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('saves a note and updates state', async () => {
    const savedNote = { ...mockNote, content: 'Updated content' };
    mockCasesApi.getNote.mockResolvedValue(mockNote);
    mockCasesApi.updateNote.mockResolvedValue(savedNote);

    const { result } = renderHook(() => useCaseNote('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.saveNote('Updated content');
    });

    expect(mockCasesApi.updateNote).toHaveBeenCalledWith('case-1', 'Updated content');
    expect(result.current.note).toEqual(savedNote);
    expect(result.current.saving).toBe(false);
  });

  it('throws when saveNote fails', async () => {
    mockCasesApi.getNote.mockResolvedValue(mockNote);
    mockCasesApi.updateNote.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() => useCaseNote('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await expect(
      act(async () => {
        await result.current.saveNote('Bad content');
      })
    ).rejects.toThrow('Save failed');
  });
});
