import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesGrid, StanceBadge } from './SourcesGrid';
import type { SourceWithAttachments, SourceType, Stance, MetaSourceSummary } from '../types';

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
    reference_meta_source_id: null,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    const { container } = render(<SourcesGrid
      sources={[]}
      loading={true}
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    // Loading spinner is an SVG element
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows empty state when no sources', () => {
    render(<SourcesGrid
      sources={[]}
      loading={false}
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
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
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
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
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={onOpenDetail}
    />);
    // Click on the row containing the source title
    const titleElement = screen.getByText('Test Source');
    const row = titleElement.closest('tr');
    fireEvent.click(row!);
    expect(onOpenDetail).toHaveBeenCalledWith(sources[0]);
  });

  it('shows stance column for events', () => {
    const sources = [source('supports')];
    render(<SourcesGrid
      sources={sources}
      loading={false}
      isEvent={true}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    expect(screen.getByText(/Supports/)).toBeInTheDocument();
  });

  it('hides stance column for cases', () => {
    const sources = [source('supports')];
    render(<SourcesGrid
      sources={sources}
      loading={false}
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    // No stance column header for cases
    expect(screen.queryByText(/Stance/)).not.toBeInTheDocument();
  });

  it('calls onDeleteSource when deleting', () => {
    const sources = [source('supports')];
    const onDeleteSource = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));
    
    render(<SourcesGrid
      sources={sources}
      loading={false}
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={onDeleteSource}
      onOpenDetail={vi.fn()}
    />);
    
    fireEvent.click(screen.getByTitle('Delete source'));
    expect(onDeleteSource).toHaveBeenCalledWith(sources[0].id);
  });

  it('opens new source modal when clicking Add Source', () => {
    render(<SourcesGrid
      sources={[]}
      loading={false}
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
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
      isEvent={false}
      metaSources={[]}
      onCreateSource={vi.fn().mockResolvedValue(undefined)}
      onDeleteSource={vi.fn().mockResolvedValue(undefined)}
      onOpenDetail={vi.fn()}
    />);
    // The attachments column shows the count in a table cell
    const cells = screen.getAllByText('1');
    // Find the cell in the Attachments column (not the credibility badge)
    const attachmentCell = cells.find(c => c.tagName === 'TD');
    expect(attachmentCell).toBeInTheDocument();
  });
});
