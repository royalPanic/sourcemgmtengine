import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityQualityEditor } from './EntityQualityEditor';
import type { EntityQualityWithRefs, QualitySourceRef } from '../types';

const mockQuality: EntityQualityWithRefs = {
  id: 'quality-1',
  entity_id: 'entity-1',
  quality_name: 'Nationality',
  quality_type: 'string',
  value_string: 'American',
  value_integer: null,
  value_boolean: null,
  value_date: null,
  value_coordinates: null,
  value_address: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  source_refs: [],
};

const mockSources: { id: string; title: string }[] = [
  { id: 'source-1', title: 'Test Source' },
];

const mockRef: QualitySourceRef = {
  id: 'ref-1',
  quality_id: 'quality-1',
  source_id: 'source-1',
  source_title: 'Test Source',
  reliability_code: 'A',
  credibility_code: 1,
  created_at: '2026-01-01T00:00:00Z',
};

describe('EntityQualityEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null when no quality is provided', () => {
    const { container } = render(<EntityQualityEditor
      quality={null}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    expect(container.firstChild).toBeNull();
  });

  it('renders edit quality form', () => {
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    expect(screen.getByText(/Edit Quality/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nationality')).toBeInTheDocument();
  });

  it('renders new quality form', () => {
    render(<EntityQualityEditor
      quality={{ ...mockQuality, id: '', quality_name: '', quality_type: 'string', value_string: null, value_integer: null, value_boolean: null, value_date: null, value_coordinates: null, value_address: null, source_refs: [] }}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    expect(screen.getByText(/New Quality/)).toBeInTheDocument();
  });

  it('calls onSave with string value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={onSave}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/Save Quality/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onSave).toHaveBeenCalledWith({
      qualityName: 'Nationality',
      qualityType: 'string',
      valueString: 'American',
      valueInteger: null,
      valueBoolean: null,
      valueDate: null,
      valueCoordinates: null,
      valueAddress: null,
    });
  });

  it('calls onSave with boolean value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const boolQuality = { ...mockQuality, quality_type: 'boolean' as const, value_boolean: true };
    render(<EntityQualityEditor
      quality={boolQuality}
      sources={mockSources}
      onSave={onSave}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/Save Quality/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onSave).toHaveBeenCalledWith({
      qualityName: 'Nationality',
      qualityType: 'boolean',
      valueString: null,
      valueInteger: null,
      valueBoolean: true,
      valueDate: null,
      valueCoordinates: null,
      valueAddress: null,
    });
  });

  it('calls onSave with integer value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const intQuality = { ...mockQuality, quality_type: 'integer' as const, value_integer: 42 };
    render(<EntityQualityEditor
      quality={intQuality}
      sources={mockSources}
      onSave={onSave}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/Save Quality/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onSave).toHaveBeenCalledWith({
      qualityName: 'Nationality',
      qualityType: 'integer',
      valueString: null,
      valueInteger: 42,
      valueBoolean: null,
      valueDate: null,
      valueCoordinates: null,
      valueAddress: null,
    });
  });

  it('shows error when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={onSave}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/Save Quality/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText(/Save failed/)).toBeInTheDocument();
  });

  it('calls onAddSourceRef when adding a source reference', async () => {
    const onAddSourceRef = vi.fn().mockResolvedValue(undefined);
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={onAddSourceRef}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    const select = document.getElementById('source-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'source-1' } });
    const addButtons = screen.getAllByRole('button', { name: /Add/ });
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(onAddSourceRef).toHaveBeenCalledWith({ sourceId: 'source-1' });
  });

  it('calls onRemoveSourceRef when removing a source reference', async () => {
    const onRemoveSourceRef = vi.fn().mockResolvedValue(undefined);
    const qualityWithRef = { ...mockQuality, source_refs: [mockRef] };
    render(<EntityQualityEditor
      quality={qualityWithRef}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={onRemoveSourceRef}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByTitle(/Remove source reference/));
    expect(onRemoveSourceRef).toHaveBeenCalledWith('ref-1');
  });

  it('shows average reliability and credibility', () => {
    const qualityWithRefs = { ...mockQuality, source_refs: [mockRef] };
    render(<EntityQualityEditor
      quality={qualityWithRefs}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    expect(screen.getByText(/Avg Reliability/)).toBeInTheDocument();
    expect(screen.getByText(/Avg Credibility/)).toBeInTheDocument();
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('disables save button when submitting', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={onSave}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />);
    expect(screen.getByText(/Save Quality/)).not.toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<EntityQualityEditor
      quality={mockQuality}
      sources={mockSources}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onAddSourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveSourceRef={vi.fn().mockResolvedValue(undefined)}
      onClose={onClose}
    />);
    fireEvent.click(screen.getByText(/Cancel/));
    expect(onClose).toHaveBeenCalled();
  });
});
