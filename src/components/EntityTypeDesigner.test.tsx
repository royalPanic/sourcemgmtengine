import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntityTypeDesigner } from './EntityTypeDesigner';
import type { EntityType } from '../types';

const mockTypes: EntityType[] = [
  { id: 'type-1', name: 'Person', description: null, default_qualities: [], is_builtin: true },
];

const customTypes: EntityType[] = [
  { id: 'custom', name: 'Custom', description: null, default_qualities: [], is_builtin: false },
];

/** The props every render needs; individual tests override what they assert on. */
function renderDesigner(overrides: Partial<Parameters<typeof EntityTypeDesigner>[0]> = {}) {
  const props = {
    types: mockTypes,
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<EntityTypeDesigner {...props} />);
  return props;
}

/** Fills the New Type form with the minimum the save button needs. */
function fillNewType(id: string, name: string) {
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/), {
    target: { value: id },
  });
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/), {
    target: { value: name },
  });
}

describe('EntityTypeDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders type list view', () => {
    renderDesigner();
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText(/New Type/)).toBeInTheDocument();
  });

  it('opens new type form when clicking New Type', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    expect(screen.getByText(/New Entity Type/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/)).toBeInTheDocument();
  });

  it('opens edit form when clicking a type', () => {
    renderDesigner();
    fireEvent.click(screen.getByText('Person'));
    expect(screen.getByText(/Edit: Person/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/)).toHaveValue('type-1');
    expect(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/)).toHaveValue('Person');
  });

  it('goes back to list when Cancel is clicked (not editing)', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    // Fill in some data first
    const idInput = screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/);
    fireEvent.change(idInput, { target: { value: 'test-type' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/);
    fireEvent.change(nameInput, { target: { value: 'Test Type' } });
    // Click Cancel - should go back to list view
    const cancelButtons = screen.getAllByRole('button', { name: /Cancel/ });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    // Should be back in list view
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. person, organization, vehicle/)).not.toBeInTheDocument();
  });

  it('enables save when type ID and name are filled', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    const idInput = screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/);
    fireEvent.change(idInput, { target: { value: 'test-type' } });
    const nameInput = screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/);
    fireEvent.change(nameInput, { target: { value: 'Test Type' } });
    expect(screen.getByRole('button', { name: /Create Type/ })).not.toBeDisabled();
  });

  it('adds a quality to the list', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    const nameInput = screen.getByPlaceholderText(/e\.g\. Name/);
    fireEvent.change(nameInput, { target: { value: 'Nationality' } });
    fireEvent.click(screen.getByText(/Add Quality/));
    expect(screen.getByText('Nationality')).toBeInTheDocument();
  });

  it('removes a quality from the list', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    const nameInput = screen.getByPlaceholderText(/e\.g\. Name/);
    fireEvent.change(nameInput, { target: { value: 'Nationality' } });
    fireEvent.click(screen.getByText(/Add Quality/));
    expect(screen.getByText('Nationality')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Remove/));
    expect(screen.queryByText('Nationality')).not.toBeInTheDocument();
  });

  it('disables Add Quality when name is empty', () => {
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    const addButton = screen.getByText(/Add Quality/);
    expect(addButton).toBeDisabled();
  });

  it('shows quality type options', () => {
    renderDesigner();
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
    renderDesigner();
    fireEvent.click(screen.getByText(/New Type/));
    const saveButton = screen.getByText(/Create Type/);
    expect(saveButton).toBeDisabled();
  });

  it('persists a new type through onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderDesigner({ onCreate });

    fireEvent.click(screen.getByText(/New Type/));
    fillNewType('vehicle', 'Vehicle');
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Name/), {
      target: { value: 'Callsign' },
    });
    fireEvent.click(screen.getByText(/Add Quality/));
    fireEvent.click(screen.getByText(/Create Type/));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());

    expect(onCreate).toHaveBeenCalledWith({
      id: 'vehicle',
      name: 'Vehicle',
      description: undefined,
      defaultQualities: [{ name: 'Callsign', type: 'string', required: false }],
    });
  });

  it('persists an edit through onUpdate', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderDesigner({ onUpdate });

    fireEvent.click(screen.getByText('Person'));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Person, Organization, Vehicle/), {
      target: { value: 'Human' },
    });
    fireEvent.click(screen.getByText(/Save Type/));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());

    expect(onUpdate).toHaveBeenCalledWith(
      'type-1',
      expect.objectContaining({ name: 'Human' })
    );
  });

  it('sends an empty description when clearing it', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderDesigner({
      types: [{ ...mockTypes[0]!, description: 'A person' }],
      onUpdate,
    });

    fireEvent.click(screen.getByText('Person'));
    fireEvent.change(screen.getByPlaceholderText('What kind of entity is this?'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText(/Save Type/));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        'type-1',
        expect.objectContaining({ description: '' })
      );
    });
  });

  it('surfaces a backend rejection instead of silently closing', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('already exists'));
    renderDesigner({ onCreate });

    fireEvent.click(screen.getByText(/New Type/));
    fillNewType('person', 'Person');
    fireEvent.click(screen.getByText(/Create Type/));

    await waitFor(() => expect(screen.getByText(/already exists/)).toBeInTheDocument());

    // Still on the form, so the operator can correct the id.
    expect(screen.getByText(/New Entity Type/)).toBeInTheDocument();
  });

  it('marks built-in types and hides their delete action', () => {
    renderDesigner();
    expect(screen.getByText(/Built-in/)).toBeInTheDocument();
    expect(screen.queryByTitle(/Delete Person/)).not.toBeInTheDocument();
  });

  it('offers a delete action for a custom type', () => {
    renderDesigner({ types: customTypes });

    expect(screen.queryByText(/Built-in/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/Delete Custom/)).toBeInTheDocument();
  });

  it('deletes a custom type through onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderDesigner({ types: customTypes, onDelete });

    fireEvent.click(screen.getByTitle(/Delete Custom/));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('custom'));
  });

  it('keeps the type when the delete confirmation is dismissed', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderDesigner({ types: customTypes, onDelete });

    fireEvent.click(screen.getByTitle(/Delete Custom/));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('surfaces a delete rejection', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('still used by one or more entities'));
    renderDesigner({ types: customTypes, onDelete });

    fireEvent.click(screen.getByTitle(/Delete Custom/));

    await waitFor(() =>
      expect(screen.getByText(/still used by one or more entities/)).toBeInTheDocument()
    );
  });

  it('locks the type ID while editing', () => {
    renderDesigner();
    fireEvent.click(screen.getByText('Person'));

    expect(screen.getByPlaceholderText(/e\.g\. person, organization, vehicle/)).toHaveAttribute(
      'readonly'
    );
  });
});