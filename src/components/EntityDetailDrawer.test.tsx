import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityDetailDrawer } from './EntityDetailDrawer';
import type { Case, Entity, EntityQualityWithRefs } from '../types';

const mockEntity: Entity = {
  id: 'entity-1',
  entity_type: 'person',
  name: 'John Doe',
  description: 'A test entity',
  case_id: 'case-1',
  is_global: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockQualities: EntityQualityWithRefs[] = [
  {
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
  },
];

const mockSources: { id: string; title: string }[] = [
  { id: 'source-1', title: 'Test Source' },
];

const mockCases: Case[] = [
  {
    id: 'case-1',
    title: 'Test Case',
    description: null,
    kind: 'case',
    event_date: null,
    event_time: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'case-2',
    title: 'Other Case',
    description: null,
    kind: 'case',
    event_date: null,
    event_time: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('EntityDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null when not open', () => {
    const { container } = render(<EntityDetailDrawer
      isOpen={false}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(container.firstChild).toBeNull();
  });

  it('renders entity details when open', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText(/Entity Details/)).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('person')).toBeInTheDocument();
  });

  it('calls onClose when clicking the close button', () => {
    const onClose = vi.fn();
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={onClose}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onUpdateEntity when saving changes', async () => {
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={onUpdateEntity}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByText(/Edit/));
    fireEvent.click(screen.getByText(/Save Changes/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onUpdateEntity).toHaveBeenCalled();
  });

  it('shows error when update fails', async () => {
    const onUpdateEntity = vi.fn().mockRejectedValue(new Error('Update failed'));
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={onUpdateEntity}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByText(/Edit/));
    fireEvent.click(screen.getByText(/Save Changes/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText(/Update failed/)).toBeInTheDocument();
  });

  it('calls onDeleteEntity when deleting', async () => {
    const onDeleteEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={onDeleteEntity}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    // Click the Delete button in the footer (the one with text "Delete")
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/ });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(onDeleteEntity).toHaveBeenCalledWith('entity-1');
  });

  it('shows qualities list', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText('Nationality')).toBeInTheDocument();
    expect(screen.getByText('American')).toBeInTheDocument();
  });

  it('shows no qualities message when empty', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={[]}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText(/No qualities yet/)).toBeInTheDocument();
  });

  it('opens quality editor when Add Quality is clicked', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByText(/Add Quality/));
    expect(screen.getByText(/New Quality/)).toBeInTheDocument();
  });

  it('opens quality editor when Edit quality is clicked', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByTitle(/Edit quality/));
    expect(screen.getByText(/Edit Quality/)).toBeInTheDocument();
  });

  it('deletes quality when Delete quality is clicked', async () => {
    const onDeleteQuality = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={onDeleteQuality}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByTitle(/Delete quality/));
    expect(onDeleteQuality).toHaveBeenCalledWith('quality-1');
  });

  it('surfaces an error when deleting a quality fails', async () => {
    const onDeleteQuality = vi.fn().mockRejectedValue(new Error('Delete failed'));
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={onDeleteQuality}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByTitle(/Delete quality/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText(/Delete failed/)).toBeInTheDocument();
  });

  it('does not delete a quality when the confirmation is dismissed', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const onDeleteQuality = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={onDeleteQuality}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByTitle(/Delete quality/));
    expect(onDeleteQuality).not.toHaveBeenCalled();
  });

  it('shows an em dash for a quality with no value', () => {    const emptyQuality = { ...mockQualities[0], value_string: null };
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={[emptyQuality]}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Provenance not recorded/)).toBeInTheDocument();
  });

  it('shows global entity as Yes', () => {
    const globalEntity = { ...mockEntity, is_global: true };
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={globalEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText(/Yes/)).toBeInTheDocument();
  });

  it('shows case-specific entity as No', () => {
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    expect(screen.getByText(/No/)).toBeInTheDocument();
  });

  it('lets an existing entity be reassigned to another case', async () => {
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={onUpdateEntity}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByText(/^Edit$/));

    // The container is an editable picker, not a read-only id.
    fireEvent.change(screen.getByDisplayValue('Test Case'), { target: { value: 'case-2' } });
    fireEvent.click(screen.getByText(/Save Changes/));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onUpdateEntity).toHaveBeenCalledWith('entity-1', expect.objectContaining({
      caseId: 'case-2',
      isGlobal: false,
    }));
  });

  it('clears the container when an entity is made global', async () => {
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntityDetailDrawer
      isOpen={true}
      onClose={vi.fn()}
      entity={mockEntity}
      qualities={mockQualities}
      sources={mockSources}
      cases={mockCases}
      onUpdateEntity={onUpdateEntity}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
    />);
    fireEvent.click(screen.getByText(/^Edit$/));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText(/Save Changes/));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onUpdateEntity).toHaveBeenCalledWith('entity-1', expect.objectContaining({
      caseId: '',
      isGlobal: true,
    }));
  });
});
