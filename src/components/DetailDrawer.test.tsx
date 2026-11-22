import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DetailDrawer } from './DetailDrawer';
import type { SourceAttachment, SourceWithAttachments, TimestampRecord } from '../types';

function attachment(overrides: Partial<SourceAttachment> = {}): SourceAttachment {
  return {
    id: 'att-1',
    source_id: 'source-1',
    file_name: 'photo.png',
    relative_path: 'attachments/source-1/photo.png',
    mime_type: 'image/png',
    file_size: 1024,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function source(attachments: SourceAttachment[]): SourceWithAttachments {
  return {
    id: 'source-1',
    case_id: 'case-1',
    title: 'Test Source',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: 'A',
    credibility_code: 1,
    stance: null,
    reference_source_id: null,
    reference_entity_id: null,
    source_date: null,
    source_time: null,
    custom_metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    attachments,
    reference: null,
  };
}

function timestamp(overrides: Partial<TimestampRecord> = {}): TimestampRecord {
  return {
    id: 'ts-1',
    source_attachment_id: 'att-1',
    ots_path: 'attachments/source-1/photo.png.ots',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    confirmed_at: null,
    block_height: null,
    block_time: null,
    verification_notes: [],
    ...overrides,
  };
}

const handlers = {
  onUpdate: vi.fn().mockResolvedValue(undefined),
  onImportAttachment: vi.fn().mockResolvedValue(undefined),
  onDeleteAttachment: vi.fn().mockResolvedValue(undefined),
  onOpenAttachment: vi.fn().mockResolvedValue(undefined),
  resolveAttachmentUrl: vi.fn().mockResolvedValue(''),
  downloadMedia: vi.fn().mockResolvedValue(undefined),
};

function renderDrawer(overrides: Partial<Parameters<typeof DetailDrawer>[0]> = {}) {
  return render(
    <DetailDrawer
      isOpen
      onClose={vi.fn()}
      source={source([attachment()])}
      siblings={[]}
      entities={[]}
      timestampAttachment={vi.fn().mockResolvedValue(timestamp())}
      verifyTimestamp={vi.fn().mockResolvedValue(timestamp())}
      getTimestampStatus={vi.fn().mockResolvedValue(null)}
      {...handlers}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DetailDrawer OpenTimestamps controls', () => {
  it('offers to stamp an attachment that has no timestamp', async () => {
    const getTimestampStatus = vi.fn().mockResolvedValue(null);
    renderDrawer({ getTimestampStatus });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Timestamp$/ })).toBeEnabled();
    });
    expect(getTimestampStatus).toHaveBeenCalledWith('att-1');
  });

  it('loads an existing timestamp instead of offering to stamp again', async () => {
    // This is the regression: without loading stored status, an already
    // stamped attachment showed an enabled "Timestamp" button and failed with
    // "Attachment already has a timestamp".
    const getTimestampStatus = vi.fn().mockResolvedValue(timestamp());

    renderDrawer({ getTimestampStatus });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Timestamped/ })).toBeDisabled();
    });
  });

  it('shows the attested block for a confirmed timestamp', async () => {
    const getTimestampStatus = vi.fn().mockResolvedValue(
      timestamp({
        status: 'confirmed',
        block_height: 800000,
        block_time: '2023-07-24T03:17:09+00:00',
        confirmed_at: '2026-01-02T00:00:00Z',
        verification_notes: ['Bitcoin block 800000 merkle root matches'],
      })
    );

    renderDrawer({ getTimestampStatus });

      // The status badge names the attested block.
      await waitFor(() => {
        expect(screen.getByText('confirmed · block 800000')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Bitcoin block 800000 merkle root matches/)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Timestamped/ })).toBeDisabled();
    });

    it('verify is available for a pending timestamp and updates the badge', async () => {
      const getTimestampStatus = vi.fn().mockResolvedValue(timestamp());
      const verifyTimestamp = vi.fn().mockResolvedValue(
        timestamp({
          status: 'confirmed',
          block_height: 800000,
          verification_notes: ['Bitcoin block 800000 merkle root matches'],
        })
      );

      renderDrawer({ getTimestampStatus, verifyTimestamp });

      const verifyButton = await screen.findByRole('button', { name: /^Verify$/ });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(verifyTimestamp).toHaveBeenCalledWith('att-1');
      });
      await waitFor(() => {
        expect(screen.getByText('confirmed · block 800000')).toBeInTheDocument();
      });
    });

  it('surfaces a stamping failure to the operator', async () => {
    const getTimestampStatus = vi.fn().mockResolvedValue(null);
    const timestampAttachment = vi
      .fn()
      .mockRejectedValue(new Error('All calendar submissions failed'));

    renderDrawer({ getTimestampStatus, timestampAttachment });

    const stampButton = await screen.findByRole('button', { name: /^Timestamp$/ });
    fireEvent.click(stampButton);

    await waitFor(() => {
      expect(
        screen.getByText(/All calendar submissions failed/)
      ).toBeInTheDocument();
    });
  });
});

describe('DetailDrawer Admiralty rating', () => {
  const entity = {
    id: 'entity-1',
    entity_type: 'organization',
    name: 'Reuters',
    description: null,
    case_id: null,
    is_global: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  function credibilitySelect(): HTMLSelectElement {
    return screen.getByLabelText(/Information Credibility/i) as HTMLSelectElement;
  }

  it('keeps credibility editable on a source that references an entity', async () => {
    // Regression: saving an entity-referencing source used to drop the
    // credibility patch, so the value snapped back after reload.
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderDrawer({
      onUpdate,
      source: { ...source([attachment()]), reference_entity_id: 'entity-1' },
      entities: [entity],
    });

    expect(credibilitySelect()).not.toBeDisabled();

    fireEvent.change(credibilitySelect(), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        'source-1',
        expect.objectContaining({ credibilityCode: 4 })
      );
    });
  });

  it('does not clear credibility when an entity reference is selected', async () => {
    renderDrawer({
      source: { ...source([attachment()]), credibility_code: 3 },
      entities: [entity],
    });

    fireEvent.change(screen.getByLabelText(/Reference/i), {
      target: { value: 'entity:entity-1' },
    });

    expect(credibilitySelect().value).toBe('3');
  });
});