import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { SourceWithAttachments } from '../types';

function source(
  stance: 'supports' | 'refutes' | 'neutral' | null,
  reliability: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null,
  credibility: 1 | 2 | 3 | 4 | 5 | 6 | null,
  overrides: Partial<SourceWithAttachments> = {}
): SourceWithAttachments {
  return {
    id: Math.random().toString(36),
    case_id: 'case-1',
    title: 'test',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: reliability,
    credibility_code: credibility,
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

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when no sources', () => {
    render(<Dashboard sources={[]} loading={false} />);
    expect(screen.getByText(/No sources to analyse/)).toBeInTheDocument();
  });

  it('shows loading state when loading', () => {
    const { container } = render(<Dashboard sources={[]} loading />);
    // When loading, analytics isn't computed yet, so it shows a spinner
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders event dashboard header', () => {
    const sources = [
      source('supports', 'A', 1),
      source('refutes', 'D', 4),
    ];
    render(<Dashboard sources={sources} loading={false} />);
    expect(screen.getByText(/Event Dashboard/)).toBeInTheDocument();
  });

  it('renders stance buckets', () => {
    const sources = [
      source('supports', 'A', 1),
      source('refutes', 'D', 4),
      source(null, 'C', 3),
    ];
    render(<Dashboard sources={sources} loading={false} />);
    // Use getAllByText since there are multiple elements with the same text
    expect(screen.getAllByText(/Supports/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Refutes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Neutral/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/None/).length).toBeGreaterThan(0);
  });

  it('shows exclude unjudgeable checkbox', () => {
    render(<Dashboard sources={[source('supports', 'A', 1)]} loading={false} />);
    expect(screen.getByLabelText(/Exclude unjudgeable/)).toBeInTheDocument();
  });

  it('toggles exclude unjudgeable', () => {
    const sources = [
      source('supports', 'A', 1),
      source('supports', 'F', 6),
    ];
    render(<Dashboard sources={sources} loading={false} />);
    
    const checkbox = screen.getByLabelText(/Exclude unjudgeable/);
    expect(checkbox).not.toBeChecked();
    
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('displays reliability and credibility averages', () => {
    const sources = [
      source('supports', 'A', 1),
      source('supports', 'B', 2),
    ];
    render(<Dashboard sources={sources} loading={false} />);
    // Use getAllByText since there are multiple elements with "1.5"
    expect(screen.getAllByText(/1\.5/).length).toBeGreaterThan(0);
  });

  it('shows total source count', () => {
    const sources = [
      source('supports', 'A', 1),
      source('refutes', 'D', 4),
    ];
    render(<Dashboard sources={sources} loading={false} />);
    expect(screen.getByText(/Total Sources/)).toBeInTheDocument();
    // Use getAllByText since there are multiple elements with "2"
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });
});
