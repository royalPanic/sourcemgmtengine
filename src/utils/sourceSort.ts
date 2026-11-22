/**
 * Ordering for the sources grid.
 *
 * Sorting is a view concern: the backend returns every source for a container
 * in one call, so the grid reorders that list locally. Nothing here touches the
 * database, and `useSources` keeps its own `created_at DESC` order.
 */

import type { SourceWithAttachments } from '../types';

export type SourceSortField = 'source_date' | 'updated_at';
export type SortDirection = 'asc' | 'desc';

export interface SourceSort {
  field: SourceSortField;
  direction: SortDirection;
}

export const SOURCE_SORT_STORAGE_KEY = 'sourcemgmtengine.sources.sort';

/** Newest first: the useful default for a timeline of captures. */
export const DEFAULT_SOURCE_SORT: SourceSort = { field: 'source_date', direction: 'desc' };

const DEFAULT_DIRECTION: Record<SourceSortField, SortDirection> = {
  source_date: 'desc',
  updated_at: 'desc',
};

const SORT_FIELDS: readonly SourceSortField[] = ['source_date', 'updated_at'];

/** A source with no value for the active field. */
function isUndated(source: SourceWithAttachments, field: SourceSortField): boolean {
  if (field === 'source_date') return !source.source_date;
  return !source.updated_at;
}

/**
 * Compares two sources on the active field, ascending.
 *
 * `source_date` and `source_time` are zero-padded (`YYYY-MM-DD`, `HH:MM`), so a
 * plain string compare orders them correctly without constructing a `Date` —
 * which would shift the value into the viewer's timezone.
 */
function compareField(
  a: SourceWithAttachments,
  b: SourceWithAttachments,
  field: SourceSortField
): number {
  if (field === 'source_date') {
    const byDate = (a.source_date ?? '').localeCompare(b.source_date ?? '');
    if (byDate !== 0) return byDate;
    // A date without a time is the start of that day.
    return (a.source_time ?? '00:00').localeCompare(b.source_time ?? '00:00');
  }

  const aTime = Date.parse(a.updated_at);
  const bTime = Date.parse(b.updated_at);
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return (a.updated_at ?? '').localeCompare(b.updated_at ?? '');
  }
  return aTime - bTime;
}

/** Newest first, then by id, so equal keys never reorder between renders. */
function compareTieBreak(a: SourceWithAttachments, b: SourceWithAttachments): number {
  const aCreated = Date.parse(a.created_at);
  const bCreated = Date.parse(b.created_at);
  if (!Number.isNaN(aCreated) && !Number.isNaN(bCreated) && aCreated !== bCreated) {
    return bCreated - aCreated;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Comparator for the sources grid.
 *
 * Sources with no value for the active field always come first, in both
 * directions: an undated capture is a gap in the timeline, not the oldest
 * entry, so it should not be buried at the bottom when sorting newest-first.
 */
export function compareSources(
  a: SourceWithAttachments,
  b: SourceWithAttachments,
  sort: SourceSort
): number {
  const aUndated = isUndated(a, sort.field);
  const bUndated = isUndated(b, sort.field);

  if (aUndated !== bUndated) return aUndated ? -1 : 1;

  if (!aUndated) {
    const byField = compareField(a, b, sort.field);
    if (byField !== 0) return sort.direction === 'asc' ? byField : -byField;
  }

  return compareTieBreak(a, b);
}

/** Clicking the active column flips it; a new column starts at its default. */
export function nextSort(current: SourceSort, field: SourceSortField): SourceSort {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field, direction: DEFAULT_DIRECTION[field] };
}

function isSortField(value: unknown): value is SourceSortField {
  return typeof value === 'string' && SORT_FIELDS.includes(value as SourceSortField);
}

/** Reads the remembered sort, falling back to the default for anything unusable. */
export function loadSourceSort(): SourceSort {
  try {
    const raw = window.localStorage.getItem(SOURCE_SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SOURCE_SORT;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SOURCE_SORT;

    const { field, direction } = parsed as Partial<SourceSort>;
    if (!isSortField(field)) return DEFAULT_SOURCE_SORT;
    if (direction !== 'asc' && direction !== 'desc') return DEFAULT_SOURCE_SORT;

    return { field, direction };
  } catch {
    // Storage can be unavailable or hold malformed JSON; neither should break the grid.
    return DEFAULT_SOURCE_SORT;
  }
}

export function saveSourceSort(sort: SourceSort): void {
  try {
    window.localStorage.setItem(SOURCE_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // A blocked storage API only costs the preference, not the session.
  }
}
