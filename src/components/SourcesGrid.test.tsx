import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesGrid, StanceBadge } from './SourcesGrid';
import type { SourceWithAttachments, Stance } from '../types';

function source(
  stance: Stance | null,
  overrides: Partial<SourceWithAttachments> = {}
): SourceWithAttachments {
  return {
    id: Math.random().toString(36),
    case_id: 'case-1',
    title: 'Test Source',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: 'A',
    credibility_code: 1,
    stance,
    reference_source_id: null,
    reference_entity_id: null,
    source_date: null,
    source_time: null,
    custom_metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    attachments: [],
    reference: null,
    ...overrides,
  };
}

describe('StanceBadge', () => {
  it('renders dash for null stance', () => {
    render(<StanceBadge stance={null} />);
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('renders supports stance', () => {
    render(<StanceBadge stance="supports" />);
    expect(screen.getByText(/Supports/)).toBeInTheDocument();
  });

  it('renders refutes stance', () => {
    render(<StanceBadge stance="refutes" />);
    expect(screen.getByText(/Refutes/)).toBeInTheDocument();
  });

  it('renders neutral stance', () => {
    render(<StanceBadge stance="neutral" />);
    expect(screen.getByText(/Neutral/)).toBeInTheDocument();
  });
});

describe('SourcesGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    const { container } = render(<SourcesGrid
      sources={[]}
      loading={true}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    // Loading spinner is an SVG element
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows empty state when no sources', () => {
    render(<SourcesGrid
      sources={[]}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    expect(screen.getByText(/No sources yet/)).toBeInTheDocument();
  });

  it('renders source list', () => {
    const sources = [source('supports'), source('refutes')];
    const onOpenDetail = vi.fn();
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={onOpenDetail}
    />);
    expect(screen.getAllByText('Test Source')).toHaveLength(2);
  });

  it('calls onOpenDetail when clicking a source row', () => {
    const sources = [source('supports')];
    const onOpenDetail = vi.fn();
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={onOpenDetail}
    />);
    // Click on the row containing the source title
    const titleElement = screen.getByText('Test Source');
    const row = titleElement.closest('tr');
    fireEvent.click(row!);
    expect(onOpenDetail).toHaveBeenCalledWith(sources[0]);
  });

  it('shows stance column', () => {
    const sources = [source('supports')];
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    expect(screen.getByText(/Supports/)).toBeInTheDocument();
  });

  it('shows stance column', () => {
    const sources = [source('supports')];
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    expect(screen.getByText(/Supports/)).toBeInTheDocument();
  });

  it('calls onDeleteSource when deleting', () => {
    const sources = [source('supports')];
    const onDeleteSource = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));
    
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={onDeleteSource}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    
    fireEvent.click(screen.getByTitle('Delete source'));
    expect(onDeleteSource).toHaveBeenCalledWith(sources[0].id);
  });

  it('opens new source modal when clicking Add Source', () => {
    render(<SourcesGrid
      sources={[]}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: /Add Source/ }));
    // The modal should open - there are 3 "Add Source" texts (button + heading + submit button)
    expect(screen.getAllByText(/Add Source/)).toHaveLength(3);
  });

  it('shows attachment count', () => {
    const sources = [source('supports', { attachments: [{ id: 'a1', source_id: 's1', file_name: 'test.jpg', relative_path: 'p/test.jpg', mime_type: 'image/jpeg', file_size: 1024, created_at: '2026-01-01T00:00:00Z' }] })];
    render(<SourcesGrid
      sources={sources}
      loading={false}
      entities={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onUpdateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onImportAttachment={vi.fn().mockResolvedValue(undefined)}
      onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    // The attachments column shows the count in a table cell
    const cells = screen.getAllByText('1');
    // Find the cell in the Attachments column (not the credibility badge)
    const attachmentCell = cells.find(c => c.tagName === 'TD');
    expect(attachmentCell).toBeInTheDocument();
  });

  describe('sorting', () => {
    const dated = [
      source('supports', { id: 'a', title: 'Older', source_date: '2026-01-05' }),
      source('supports', { id: 'b', title: 'Newer', source_date: '2026-04-20' }),
      source('supports', { id: 'c', title: 'Undated' }),
    ];

    function renderGrid(sources: SourceWithAttachments[]) {
      return render(<SourcesGrid
        sources={sources}
        loading={false}
        entities={[]}
        onCreateSource={vi.fn().mockResolvedValue(undefined)}
        onUpdateSource={vi.fn().mockResolvedValue(undefined)}
        onDeleteSource={vi.fn().mockResolvedValue(undefined)}
        onImportAttachment={vi.fn().mockResolvedValue(undefined)}
        onDeleteAttachment={vi.fn().mockResolvedValue(undefined)}
        onOpenAttachment={vi.fn().mockResolvedValue(undefined)}
        onOpenDetail={vi.fn()}
      />);
    }

    function renderedTitles(): string[] {
      return screen
        .getAllByRole('row')
        .slice(1)
        .map(row => row.querySelector('td')?.textContent ?? '');
    }

    it('defaults to source date, newest first, with undated sources first', () => {
      renderGrid(dated);
      expect(renderedTitles()).toEqual(['Undated', 'Newer', 'Older']);
    });

    it('flips direction when the Date header is clicked again', () => {
      renderGrid(dated);
      const dateHeader = screen.getByRole('button', { name: /Date/ });

      fireEvent.click(dateHeader);
      expect(renderedTitles()).toEqual(['Undated', 'Older', 'Newer']);

      fireEvent.click(dateHeader);
      expect(renderedTitles()).toEqual(['Undated', 'Newer', 'Older']);
    });

    it('sorts by updated_at when the Updated header is clicked', () => {
      renderGrid([
        source('supports', { id: 'a', title: 'Stale', updated_at: '2026-01-01T00:00:00Z' }),
        source('supports', { id: 'b', title: 'Fresh', updated_at: '2026-06-01T00:00:00Z' }),
      ]);

      fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
      expect(renderedTitles()).toEqual(['Fresh', 'Stale']);
    });

    it('exposes the active sort through aria-sort', () => {
      renderGrid(dated);
      const dateHeader = screen.getByRole('button', { name: /Date/ }).closest('th');
      const updatedHeader = screen.getByRole('button', { name: /Updated/ }).closest('th');

      expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
      expect(updatedHeader).toHaveAttribute('aria-sort', 'none');

      fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
      expect(dateHeader).toHaveAttribute('aria-sort', 'none');
      expect(updatedHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('remembers the chosen sort', () => {
      const { unmount } = renderGrid(dated);
      fireEvent.click(screen.getByRole('button', { name: /Date/ }));
      unmount();

      renderGrid(dated);
      expect(renderedTitles()).toEqual(['Undated', 'Older', 'Newer']);
    });
  });
});










