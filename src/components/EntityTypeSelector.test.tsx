import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityTypeSelector } from './EntityTypeSelector';
import type { EntityType } from '../types';

const mockTypes: EntityType[] = [
  { id: 'type-1', name: 'Person', description: null, default_qualities: [] },
  { id: 'type-2', name: 'Organization', description: null, default_qualities: [] },
];

describe('EntityTypeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a select with type options', () => {
    render(<EntityTypeSelector types={mockTypes} value={null} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Select a type')).toBeInTheDocument();
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('shows the selected type', () => {
    render(<EntityTypeSelector types={mockTypes} value="type-1" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('type-1');
  });

  it('calls onChange when a type is selected', () => {
    const onChange = vi.fn();
    render(<EntityTypeSelector types={mockTypes} value={null} onChange={onChange} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'type-2' } });
    expect(onChange).toHaveBeenCalledWith('type-2');
  });

  it('calls onChange with null when empty is selected', () => {
    const onChange = vi.fn();
    render(<EntityTypeSelector types={mockTypes} value="type-1" onChange={onChange} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is disabled when no types are available', () => {
    render(<EntityTypeSelector types={[]} value={null} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(screen.getByText(/No entity types available/)).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<EntityTypeSelector types={mockTypes} value={null} onChange={vi.fn()} disabled />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });
});
