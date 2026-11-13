import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SOURCE_SORT,
  SOURCE_SORT_STORAGE_KEY,
  compareSources,
  loadSourceSort,
  nextSort,
  saveSourceSort,
  type SourceSort,
} from './sourceSort';
import type { SourceWithAttachments } from '../types';

function source(overrides: Partial<SourceWithAttachments> = {}): SourceWithAttachments {
  return {
    id: 'source-1',
    case_id: 'case-1',
    title: 'Test Source',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: null,
    credibility_code: null,
    stance: null,
    reference_source_id: null,
    reference_entity_id: null,
    source_date: null,
    source_time: null,
    custom_metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    attachments: [],
    reference: null,
    ...overrides,
  };
}

function titles(sources: SourceWithAttachments[], sort: SourceSort): string[] {
  return [...sources].sort((a, b) => compareSources(a, b, sort)).map(s => s.title);
}

const NEWEST_FIRST: SourceSort = { field: 'source_date', direction: 'desc' };
const OLDEST_FIRST: SourceSort = { field: 'source_date', direction: 'asc' };

describe('compareSources', () => {
  it('orders by source date, newest first', () => {
    const sources = [
      source({ id: 'a', title: 'middle', source_date: '2026-03-02' }),
      source({ id: 'b', title: 'newest', source_date: '2026-05-01' }),
      source({ id: 'c', title: 'oldest', source_date: '2025-12-31' }),
    ];

    expect(titles(sources, NEWEST_FIRST)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('orders by source date, oldest first', () => {
    const sources = [
      source({ id: 'a', title: 'middle', source_date: '2026-03-02' }),
      source({ id: 'b', title: 'newest', source_date: '2026-05-01' }),
      source({ id: 'c', title: 'oldest', source_date: '2025-12-31' }),
    ];

    expect(titles(sources, OLDEST_FIRST)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('breaks same-day ties by time', () => {
    const sources = [
      source({ id: 'a', title: 'morning', source_date: '2026-03-02', source_time: '08:15' }),
      source({ id: 'b', title: 'evening', source_date: '2026-03-02', source_time: '21:40' }),
      source({ id: 'c', title: 'noon', source_date: '2026-03-02', source_time: '12:00' }),
    ];

    expect(titles(sources, NEWEST_FIRST)).toEqual(['evening', 'noon', 'morning']);
    expect(titles(sources, OLDEST_FIRST)).toEqual(['morning', 'noon', 'evening']);
  });

  it('treats a missing time as the start of the day', () => {
    const sources = [
      source({ id: 'a', title: 'timed', source_date: '2026-03-02', source_time: '00:01' }),
      source({ id: 'b', title: 'untimed', source_date: '2026-03-02' }),
    ];

    expect(titles(sources, OLDEST_FIRST)).toEqual(['untimed', 'timed']);
  });

  it('puts undated sources first in both directions', () => {
    const sources = [
      source({ id: 'a', title: 'dated', source_date: '2026-03-02' }),
      source({ id: 'b', title: 'undated' }),
    ];

    expect(titles(sources, NEWEST_FIRST)).toEqual(['undated', 'dated']);
    expect(titles(sources, OLDEST_FIRST)).toEqual(['undated', 'dated']);
  });

  it('orders by updated_at when that field is active', () => {
    const sources = [
      source({ id: 'a', title: 'older', updated_at: '2026-02-01T10:00:00Z' }),
      source({ id: 'b', title: 'newer', updated_at: '2026-04-01T10:00:00Z' }),
    ];

    expect(titles(sources, { field: 'updated_at', direction: 'desc' })).toEqual(['newer', 'older']);
    expect(titles(sources, { field: 'updated_at', direction: 'asc' })).toEqual(['older', 'newer']);
  });

  it('compares updated_at across differing UTC offsets', () => {
    const sources = [
      source({ id: 'a', title: 'later', updated_at: '2026-04-01T09:00:00+02:00' }),
      source({ id: 'b', title: 'earlier', updated_at: '2026-04-01T08:00:00Z' }),
    ];

    // 09:00+02:00 is 07:00Z, so it is the earlier instant.
    expect(titles(sources, { field: 'updated_at', direction: 'asc' })).toEqual(['later', 'earlier']);
  });

  it('falls back to created_at then id for equal keys', () => {
    const sources = [
      source({ id: 'a', title: 'older-created', created_at: '2026-01-01T00:00:00Z' }),
      source({ id: 'b', title: 'newer-created', created_at: '2026-02-01T00:00:00Z' }),
    ];

    expect(titles(sources, NEWEST_FIRST)).toEqual(['newer-created', 'older-created']);
  });

  it('is stable for identical sources', () => {
    const sources = [
      source({ id: 'b', title: 'b' }),
      source({ id: 'a', title: 'a' }),
    ];

    expect(titles(sources, NEWEST_FIRST)).toEqual(['a', 'b']);
  });
});

describe('nextSort', () => {
  it('flips direction when the active column is clicked again', () => {
    expect(nextSort(NEWEST_FIRST, 'source_date')).toEqual({
      field: 'source_date',
      direction: 'asc',
    });
    expect(nextSort(OLDEST_FIRST, 'source_date')).toEqual({
      field: 'source_date',
      direction: 'desc',
    });
  });

  it('starts a new column at its default direction', () => {
    expect(nextSort(OLDEST_FIRST, 'updated_at')).toEqual({
      field: 'updated_at',
      direction: 'desc',
    });
  });
});

describe('sort persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('defaults to source date, newest first', () => {
    expect(loadSourceSort()).toEqual(DEFAULT_SOURCE_SORT);
  });

  it('round-trips a saved sort', () => {
    saveSourceSort({ field: 'updated_at', direction: 'asc' });
    expect(loadSourceSort()).toEqual({ field: 'updated_at', direction: 'asc' });
  });

  it('ignores malformed or unknown stored values', () => {
    window.localStorage.setItem(SOURCE_SORT_STORAGE_KEY, 'not json');
    expect(loadSourceSort()).toEqual(DEFAULT_SOURCE_SORT);

    window.localStorage.setItem(
      SOURCE_SORT_STORAGE_KEY,
      JSON.stringify({ field: 'title', direction: 'asc' })
    );
    expect(loadSourceSort()).toEqual(DEFAULT_SOURCE_SORT);

    window.localStorage.setItem(
      SOURCE_SORT_STORAGE_KEY,
      JSON.stringify({ field: 'source_date', direction: 'sideways' })
    );
    expect(loadSourceSort()).toEqual(DEFAULT_SOURCE_SORT);
  });

  it('survives a storage API that throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadSourceSort()).toEqual(DEFAULT_SOURCE_SORT);
    expect(() => saveSourceSort(DEFAULT_SOURCE_SORT)).not.toThrow();
  });
});
