import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceSelect, locksStance, selectionOf, referenceIds, NO_REFERENCE } from './ReferenceSelect';
import type { SourceWithAttachments, Entity } from '../types';

describe('ReferenceSelect pure functions', () => {
  it('locksStance returns true for source references', () => {
    expect(locksStance({ kind: 'source', id: 's1' })).toBe(true);
    expect(locksStance({ kind: 'entity', id: 'e1' })).toBe(false);
    expect(locksStance(NO_REFERENCE)).toBe(false);
  });

  it('selectionOf reads reference columns', () => {
    expect(selectionOf({ reference_source_id: 's1', reference_entity_id: null })).toEqual({ kind: 'source', id: 's1' });
    expect(selectionOf({ reference_source_id: null, reference_entity_id: 'e1' })).toEqual({ kind: 'entity', id: 'e1' });
    expect(selectionOf({ reference_source_id: null, reference_entity_id: null })).toEqual(NO_REFERENCE);
  });

  it('referenceIds maps selection to columns', () => {
    expect(referenceIds({ kind: 'source', id: 's1' })).toEqual({ referenceSourceId: 's1', referenceEntityId: '' });
    expect(referenceIds({ kind: 'entity', id: 'e1' })).toEqual({ referenceSourceId: '', referenceEntityId: 'e1' });
    expect(referenceIds(NO_REFERENCE)).toEqual({ referenceSourceId: '', referenceEntityId: '' });
  });
});

const mockSibling: SourceWithAttachments = {
  id: 'sibling-1',
  case_id: 'case-1',
  title: 'Sibling Source',
  source_type: 'URL',
  url: null,
  raw_text: null,
  reliability_code: 'A',
  credibility_code: 1,
  stance: 'supports',
  reference_source_id: null,
  reference_entity_id: null,
  source_date: null,
  source_time: null,
  custom_metadata: '{}',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  attachments: [],
  reference: null,
};

const mockEntity: Entity = {
  id: 'entity-1',
  entity_type: 'organization',
  name: 'Reuters',
  description: null,
  case_id: null,
  is_global: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('ReferenceSelect component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders None option when no siblings or entities', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[]} entities={[]} />);
    screen.getByRole('combobox');
    expect(screen.getByText('No other sources or entities exist yet.')).toBeInTheDocument();
  });

  it('renders sibling sources in optgroup', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[mockSibling]} entities={[]} />);
    screen.getByRole('combobox');
    // optgroup label is not directly queryable by text, check the option instead
    expect(screen.getByText('Sibling Source')).toBeInTheDocument();
  });

  it('renders entities in optgroup', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[]} entities={[mockEntity]} />);
    const option = screen.getByRole('option', { name: /Reuters/ });
    expect(option).toBeInTheDocument();
  });

  it('calls onChange when selecting a sibling', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={NO_REFERENCE} onChange={onChange} siblings={[mockSibling]} entities={[]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'source:sibling-1' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'source', id: 'sibling-1' });
  });

  it('calls onChange when selecting an entity', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={NO_REFERENCE} onChange={onChange} siblings={[]} entities={[mockEntity]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'entity:entity-1' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'entity', id: 'entity-1' });
  });

  it('calls onChange when selecting None', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={{ kind: 'source', id: 'sibling-1' }} onChange={onChange} siblings={[mockSibling]} entities={[]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(NO_REFERENCE);
  });

  it('is disabled when disabled prop is true', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[mockSibling]} entities={[]} disabled />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('shows stance locked message when source reference selected', () => {
    render(<ReferenceSelect value={{ kind: 'source', id: 'sibling-1' }} onChange={vi.fn()} siblings={[mockSibling]} entities={[]} />);
    expect(screen.getByText(/Stance is disabled/)).toBeInTheDocument();
  });

  it('shows stance editable message when entity reference selected', () => {
    render(<ReferenceSelect value={{ kind: 'entity', id: 'entity-1' }} onChange={vi.fn()} siblings={[]} entities={[mockEntity]} />);
    expect(screen.getByText(/Stance stays editable/)).toBeInTheDocument();
  });
});
