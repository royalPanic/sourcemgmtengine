import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceSelect, locksStance, selectionOf, referenceIds, NO_REFERENCE } from './ReferenceSelect';
import type { SourceWithAttachments, MetaSourceSummary, ReferenceSelection } from '../types';

describe('ReferenceSelect pure functions', () => {
  it('locksStance returns true for source references', () => {
    expect(locksStance({ kind: 'source', id: 's1' })).toBe(true);
    expect(locksStance({ kind: 'meta', id: 'm1' })).toBe(false);
    expect(locksStance(NO_REFERENCE)).toBe(false);
  });

  it('selectionOf reads reference columns', () => {
    expect(selectionOf({ reference_source_id: 's1', reference_meta_source_id: null })).toEqual({ kind: 'source', id: 's1' });
    expect(selectionOf({ reference_source_id: null, reference_meta_source_id: 'm1' })).toEqual({ kind: 'meta', id: 'm1' });
    expect(selectionOf({ reference_source_id: null, reference_meta_source_id: null })).toEqual(NO_REFERENCE);
  });

  it('referenceIds maps selection to columns', () => {
    expect(referenceIds({ kind: 'source', id: 's1' })).toEqual({ referenceSourceId: 's1', referenceMetaSourceId: '' });
    expect(referenceIds({ kind: 'meta', id: 'm1' })).toEqual({ referenceSourceId: '', referenceMetaSourceId: 'm1' });
    expect(referenceIds(NO_REFERENCE)).toEqual({ referenceSourceId: '', referenceMetaSourceId: '' });
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
  reference_meta_source_id: null,
  source_date: null,
  source_time: null,
  custom_metadata: '{}',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  attachments: [],
  reference: null,
};

const mockMetaSource: MetaSourceSummary = {
  id: 'meta-1',
  name: 'Reuters',
  kind: 'organization',
  description: null,
  url: null,
  reliability_code: 'A',
  credibility_code: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  citation_count: 2,
};

describe('ReferenceSelect component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders None option when no siblings or meta sources', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[]} metaSources={[]} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('No other sources or meta sources exist yet.')).toBeInTheDocument();
  });

  it('renders sibling sources in optgroup', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[mockSibling]} metaSources={[]} />);
    const select = screen.getByRole('combobox');
    // optgroup label is not directly queryable by text, check the option instead
    expect(screen.getByText('Sibling Source')).toBeInTheDocument();
  });

  it('renders meta sources in optgroup', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[]} metaSources={[mockMetaSource]} />);
    // The option text contains "Reuters" followed by "(Organisation)" as separate text nodes
    const option = screen.getByRole('option', { name: /Reuters/ });
    expect(option).toBeInTheDocument();
  });

  it('calls onChange when selecting a sibling', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={NO_REFERENCE} onChange={onChange} siblings={[mockSibling]} metaSources={[]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'source:sibling-1' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'source', id: 'sibling-1' });
  });

  it('calls onChange when selecting a meta source', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={NO_REFERENCE} onChange={onChange} siblings={[]} metaSources={[mockMetaSource]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'meta:meta-1' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'meta', id: 'meta-1' });
  });

  it('calls onChange when selecting None', () => {
    const onChange = vi.fn();
    render(<ReferenceSelect value={{ kind: 'source', id: 'sibling-1' }} onChange={onChange} siblings={[mockSibling]} metaSources={[]} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(NO_REFERENCE);
  });

  it('is disabled when disabled prop is true', () => {
    render(<ReferenceSelect value={NO_REFERENCE} onChange={vi.fn()} siblings={[mockSibling]} metaSources={[]} disabled />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('shows stance locked message when source reference selected', () => {
    render(<ReferenceSelect value={{ kind: 'source', id: 'sibling-1' }} onChange={vi.fn()} siblings={[mockSibling]} metaSources={[]} />);
    expect(screen.getByText(/Stance is disabled/)).toBeInTheDocument();
  });

  it('shows stance editable message when meta reference selected', () => {
    render(<ReferenceSelect value={{ kind: 'meta', id: 'meta-1' }} onChange={vi.fn()} siblings={[]} metaSources={[mockMetaSource]} />);
    expect(screen.getByText(/Stance stays editable/)).toBeInTheDocument();
  });
});
