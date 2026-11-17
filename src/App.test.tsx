import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import { useEntities, useEntityQualities } from './hooks/useEntities';
import { useEntityTypes } from './hooks/useEntityTypes';

vi.mock('./hooks/useCases', () => ({
  useCases: vi.fn(),
  useCaseNote: vi.fn(() => ({
    note: null,
    loading: false,
    saving: false,
    saveNote: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock('./hooks/useSources', () => ({
  useSources: vi.fn(),
}));

vi.mock('./hooks/useEntities', () => ({
  useEntities: vi.fn(),
  useEntityQualities: vi.fn(),
}));

vi.mock('./hooks/useEntityTypes', () => ({
  useEntityTypes: vi.fn(),
}));

const mockUseCases = useCases as unknown as ReturnType<typeof vi.fn>;
const mockUseSources = useSources as unknown as ReturnType<typeof vi.fn>;
const mockUseEntities = useEntities as unknown as ReturnType<typeof vi.fn>;
const mockUseEntityQualities = useEntityQualities as unknown as ReturnType<typeof vi.fn>;
const mockUseEntityTypes = useEntityTypes as unknown as ReturnType<typeof vi.fn>;

/** The shape every hook must return for App to render. */
function hookResult(overrides: Record<string, unknown> = {}) {
  return {
    cases: [],
    sources: [],
    entities: [],
    qualities: [],
    types: [],
    loading: false,
    error: null,
    createCase: vi.fn(),
    updateCase: vi.fn(),
    deleteCase: vi.fn(),
    createSource: vi.fn(),
    updateSource: vi.fn(),
    deleteSource: vi.fn(),
    importAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    openAttachment: vi.fn(),
    getAttachmentUrl: vi.fn(),
    downloadMedia: vi.fn(),
    timestampAttachment: vi.fn(),
    verifyTimestamp: vi.fn(),
    getTimestampStatus: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    loadQualities: vi.fn(),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCases.mockReturnValue(hookResult());
    mockUseSources.mockReturnValue(hookResult());
    mockUseEntities.mockReturnValue(hookResult());
    mockUseEntityQualities.mockReturnValue(hookResult());
    mockUseEntityTypes.mockReturnValue(hookResult());
  });

  it('shows a banner when a load fails', () => {
    mockUseCases.mockReturnValue(hookResult({ error: 'Failed to load cases' }));

    render(<App />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load cases');
  });

  it('shows the first failure when several loads fail', () => {
    mockUseCases.mockReturnValue(hookResult({ error: 'cases broke' }));
    mockUseSources.mockReturnValue(hookResult({ error: 'sources broke' }));

    render(<App />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('cases broke');
    expect(alert).not.toHaveTextContent('sources broke');
  });

  it('dismisses the banner', () => {
    mockUseCases.mockReturnValue(hookResult({ error: 'Failed to load cases' }));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no banner when every load succeeds', () => {
    render(<App />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});