import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntitiesPanel } from './EntitiesPanel';
import type { Entity, EntityType } from '../types';

const mockEntities: Entity[] = [
  {
    id: 'entity-1',
    entity_type: 'person',
    name: 'John Doe',
    description: 'A test entity',
    case_id: 'case-1',
    is_global: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'entity-2',
    entity_type: 'organization',
    name: 'Reuters',
    description: 'News agency',
    case_id: null,
    is_global: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockTypes: EntityType[] = [
  { id: 'type-1', name: 'Person', description: null, default_qualities: [] },
  { id: 'type-2', name: 'Organization', description: null, default_qualities: [] },
];

describe('EntitiesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders entities list', () => {
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    expect(screen.getByText(/Entities \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Reuters')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const { container } = render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={[]}
      entityTypes={mockTypes}
      loading={true}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows empty state when no entities', () => {
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={[]}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    expect(screen.getByText(/No entities yet/)).toBeInTheDocument();
  });

  it('separates global and case-specific entities', () => {
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    expect(screen.getByText(/Global \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Case-Specific \(1\)/)).toBeInTheDocument();
  });

  it('opens new entity modal when clicking New Entity', () => {
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    const newEntityButtons = screen.getAllByText(/New Entity/);
    fireEvent.click(newEntityButtons[newEntityButtons.length - 1]);
    expect(screen.getAllByText(/New Entity/).length).toBeGreaterThan(1);
  });

  it('opens entity type designer when clicking Types', () => {
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/Types/));
    expect(screen.getByText(/New Entity Type/)).toBeInTheDocument();
  });

  it('calls onOpenEntityDetail when selecting an entity', () => {
    const onOpenEntityDetail = vi.fn();
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={onOpenEntityDetail}
    />);
    fireEvent.click(screen.getByText('John Doe'));
    expect(onOpenEntityDetail).toHaveBeenCalledWith(mockEntities[0]);
  });

  it('calls onDeleteEntity when deleting an entity', async () => {
    const onDeleteEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={onDeleteEntity}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    const entityItem = screen.getByText('John Doe').closest('div')!;
    fireEvent.mouseEnter(entityItem);
    fireEvent.click(screen.getByTitle('Delete entity'));
    expect(onDeleteEntity).toHaveBeenCalledWith('entity-1');
  });

  it('creates an entity when submitting the form', async () => {
    const onCreateEntity = vi.fn().mockResolvedValue(undefined);
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={onCreateEntity}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/New Entity/));
    const typeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(typeSelect, { target: { value: 'type-1' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. John Smith, Reuters, Toyota Camry/);
    fireEvent.change(nameInput, { target: { value: 'Test Entity' } });
    fireEvent.click(screen.getByText(/Create Entity/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onCreateEntity).toHaveBeenCalledWith({
      entityType: 'type-1',
      name: 'Test Entity',
      description: undefined,
      caseId: undefined,
      isGlobal: true,
    });
  });

  it('shows error when entity creation fails', async () => {
    const onCreateEntity = vi.fn().mockRejectedValue(new Error('Creation failed'));
    render(<EntitiesPanel
      selectedCaseId="case-1"
      entities={mockEntities}
      entityTypes={mockTypes}
      loading={false}
      onCreateEntity={onCreateEntity}
      onUpdateEntity={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntity={vi.fn().mockResolvedValue(undefined)}
      onCreateQuality={vi.fn().mockResolvedValue(undefined)}
      onUpdateQuality={vi.fn().mockResolvedValue(undefined)}
      onDeleteQuality={vi.fn().mockResolvedValue(undefined)}
      onAddQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onRemoveQualitySourceRef={vi.fn().mockResolvedValue(undefined)}
      onOpenEntityDetail={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/New Entity/));
    const typeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(typeSelect, { target: { value: 'type-1' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. John Smith, Reuters, Toyota Camry/);
    fireEvent.change(nameInput, { target: { value: 'Test Entity' } });
    fireEvent.click(screen.getByText(/Create Entity/));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText(/Creation failed/)).toBeInTheDocument();
  });
});
