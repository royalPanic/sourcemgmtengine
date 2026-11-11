import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityTypeDesigner } from './EntityTypeDesigner';
import type { EntityType } from '../types';

const mockTypes: EntityType[] = [
  { id: 'type-1', name: 'Person', description: null, default_qualities: [] },
];

describe('EntityTypeDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders type list view', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText(/New Type/)).toBeInTheDocument();
  });

  it('opens new type form when clicking New Type', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    expect(screen.getByText(/New Entity Type/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/)).toBeInTheDocument();
  });

  it('opens edit form when clicking a type', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Person'));
    expect(screen.getByText(/Edit: Person/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/)).toHaveValue('type-1');
    expect(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/)).toHaveValue('Person');
  });

  it('goes back to list when Cancel is clicked (not editing)', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    // Fill in some data first
    const idInput = screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/);
    fireEvent.change(idInput, { target: { value: 'test-type' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/);
    fireEvent.change(nameInput, { target: { value: 'Test Type' } });
    // Click Cancel - should go back to list view
    const cancelButtons = screen.getAllByRole('button', { name: /Cancel/ });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    // Should be back in list view
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. person, organization, vehicle/)).not.toBeInTheDocument();
  });

  it('enables save when type ID and name are filled', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const idInput = screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/);
    fireEvent.change(idInput, { target: { value: 'test-type' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/);
    fireEvent.change(nameInput, { target: { value: 'Test Type' } });
    expect(screen.getByRole('button', { name: /Create Type/ })).not.toBeDisabled();
  });

  it('adds a quality to the list', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const nameInput = screen.getByPlaceholderText(/e\.g\. Name/);
    fireEvent.change(nameInput, { target: { value: 'Nationality' } });
    fireEvent.click(screen.getByText(/Add Quality/));
    expect(screen.getByText('Nationality')).toBeInTheDocument();
  });

  it('removes a quality from the list', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const nameInput = screen.getByPlaceholderText(/e\.g\. Name/);
    fireEvent.change(nameInput, { target: { value: 'Nationality' } });
    fireEvent.click(screen.getByText(/Add Quality/));
    expect(screen.getByText('Nationality')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Remove/));
    expect(screen.queryByText('Nationality')).not.toBeInTheDocument();
  });

  it('disables Add Quality when name is empty', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const addButton = screen.getByText(/Add Quality/);
    expect(addButton).toBeDisabled();
  });

  it('shows quality type options', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const selects = screen.getAllByRole('combobox');
    const typeSelect = selects[selects.length - 1];
    expect(typeSelect).toBeInTheDocument();
    expect(screen.getByText('String')).toBeInTheDocument();
    expect(screen.getByText('Boolean')).toBeInTheDocument();
    expect(screen.getByText('Integer')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Coordinates')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('disables save when type ID or name is empty', () => {
    render(<EntityTypeDesigner types={mockTypes} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/New Type/));
    const saveButton = screen.getByText(/Create Type/);
    expect(saveButton).toBeDisabled();
  });
});
