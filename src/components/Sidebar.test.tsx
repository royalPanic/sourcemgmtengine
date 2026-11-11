import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, formatEventDate } from './Sidebar';
import type { Case } from '../types';

const mockCase: Case = {
  id: 'case-1',
  title: 'Test Case',
  description: 'A test case',
  kind: 'case',
  event_date: null,
  event_time: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockCaseWithDate: Case = {
  id: 'case-2',
  title: 'Test Case with Date',
  description: 'A case with date/time',
  kind: 'case',
  event_date: '2026-05-01',
  event_time: '19:30',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the app title', () => {
    render(<Sidebar
      cases={[mockCase]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    expect(screen.getByText(/OSINT Case Manager/)).toBeInTheDocument();
  });

  it('renders case list items', () => {
    render(<Sidebar
      cases={[mockCase]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    expect(screen.getByText('Test Case')).toBeInTheDocument();
  });

  it('renders case with date/time', () => {
    render(<Sidebar
      cases={[mockCaseWithDate]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    expect(screen.getByText('Test Case with Date')).toBeInTheDocument();
    expect(screen.getByText('May 1, 2026 · 19:30')).toBeInTheDocument();
  });

  it('calls onSelectCase when clicking a case', () => {
    const onSelectCase = vi.fn();
    render(<Sidebar
      cases={[mockCase]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={onSelectCase}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    fireEvent.click(screen.getByText('Test Case'));
    expect(onSelectCase).toHaveBeenCalledWith('case-1');
  });

  it('calls onCreateCase when clicking New Case', () => {
    const onCreateCase = vi.fn();
    render(<Sidebar
      cases={[]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={onCreateCase}
      onDeleteCase={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/New Case/));
    expect(onCreateCase).toHaveBeenCalled();
  });

  it('filters cases by search query', () => {
    const onSelectCase = vi.fn();
    render(<Sidebar
      cases={[mockCase, { ...mockCase, id: 'case-2', title: 'Other Case' }]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={onSelectCase}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    
    const searchInput = screen.getByPlaceholderText(/Search cases/);
    fireEvent.change(searchInput, { target: { value: 'Other' } });
    
    expect(screen.getByText('Other Case')).toBeInTheDocument();
    expect(screen.queryByText('Test Case')).not.toBeInTheDocument();
  });

  it('shows empty state when no cases', () => {
    render(<Sidebar
      cases={[]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={vi.fn()}
    />);
    expect(screen.getByText(/Nothing found/)).toBeInTheDocument();
  });

  it('calls onDeleteCase when confirming deletion', () => {
    const onDeleteCase = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));
    
    render(<Sidebar
      cases={[mockCase]}
      loading={false}
      selectedCaseId={null}
      entitiesActive={false}
      onSelectCase={vi.fn()}
      onOpenEntities={vi.fn()}
      onCreateCase={vi.fn()}
      onDeleteCase={onDeleteCase}
    />);
    
    // Hover to show delete button
    const caseItem = screen.getByText('Test Case').closest('div')!;
    fireEvent.mouseEnter(caseItem);
    
    // Click the delete button (the one with title "Delete case")
    fireEvent.click(screen.getByTitle('Delete case'));
    
    // Confirm deletion in the dialog - click the "Delete" button in the dialog
    // The dialog has a "Delete" button with btn-ghost class
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/ });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    
    expect(onDeleteCase).toHaveBeenCalledWith('case-1');
  });
});

describe('formatEventDate', () => {
  it('formats date without time', () => {
    expect(formatEventDate('2026-05-01', null)).toBe('May 1, 2026');
  });

  it('formats date with time', () => {
    expect(formatEventDate('2026-05-01', '19:30')).toBe('May 1, 2026 · 19:30');
  });

  it('returns the date string when malformed', () => {
    expect(formatEventDate('not-a-date', null)).toBe('not-a-date');
  });
});
