import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSources } from './useSources';
import { sourcesApi, filesApi, timestampApi } from '../api/tauri';
import type { SourceWithAttachments } from '../types';

vi.mock('../api/tauri', () => ({
  sourcesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
  filesApi: {
    saveAttachment: vi.fn(),
    deleteAttachmentFile: vi.fn(),
    importAttachment: vi.fn(),
    downloadMedia: vi.fn(),
    openAttachment: vi.fn(),
    assetUrl: vi.fn(),
  },
  timestampApi: {
    timestampAttachment: vi.fn(),
    verifyTimestamp: vi.fn(),
    getTimestampStatus: vi.fn(),
  },
}));

const mockSourcesApi = sourcesApi as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  addAttachment: ReturnType<typeof vi.fn>;
  deleteAttachment: ReturnType<typeof vi.fn>;
};

const mockFilesApi = filesApi as unknown as {
  saveAttachment: ReturnType<typeof vi.fn>;
  deleteAttachmentFile: ReturnType<typeof vi.fn>;
  importAttachment: ReturnType<typeof vi.fn>;
  downloadMedia: ReturnType<typeof vi.fn>;
  openAttachment: ReturnType<typeof vi.fn>;
  assetUrl: ReturnType<typeof vi.fn>;
};

const mockTimestampApi = timestampApi as unknown as {
  timestampAttachment: ReturnType<typeof vi.fn>;
  verifyTimestamp: ReturnType<typeof vi.fn>;
  getTimestampStatus: ReturnType<typeof vi.fn>;
};

const mockSource: SourceWithAttachments = {
  id: 'source-1',
  case_id: 'case-1',
  title: 'Test Source',
  source_type: 'URL',
  url: 'https://example.com',
  raw_text: 'Some raw text',
  reliability_code: 'A',
  credibility_code: 1,
  stance: 'supports',
  reference_source_id: null,
  reference_entity_id: null,
  source_date: null,
  source_time: null,
  custom_metadata: '{}',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  attachments: [],
  reference: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSources', () => {
  it('loads sources for a case', async () => {
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);

    const { result } = renderHook(() => useSources('case-1'));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.sources).toEqual([mockSource]);
    expect(result.current.error).toBeNull();
  });

  it('clears sources when no caseId', async () => {
    const { result } = renderHook(() => useSources(null));

    expect(result.current.sources).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('handles load errors', async () => {
    mockSourcesApi.getAll.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Load failed');
  });

  it('creates a source and reloads', async () => {
    const createdSource = { ...mockSource, id: 'source-new' };
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockSourcesApi.create.mockResolvedValue(createdSource);
    mockSourcesApi.get.mockResolvedValue(createdSource);
    // reloadQuietly calls getAll again
    mockSourcesApi.getAll.mockResolvedValueOnce([mockSource, createdSource]);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.createSource({
        title: 'New Source',
        sourceType: 'URL',
        url: 'https://example.com/new',
      });
    });

    // Wait for reloadQuietly to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockSourcesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        title: 'New Source',
        sourceType: 'URL',
        url: 'https://example.com/new',
      })
    );
    expect(mockSourcesApi.get).toHaveBeenCalledWith('source-new');
  });

  it('updates a source and reloads quietly', async () => {
    const updatedSource = { ...mockSource, title: 'Updated' };
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockSourcesApi.update.mockResolvedValue(updatedSource);
    mockSourcesApi.getAll.mockResolvedValueOnce([updatedSource]);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.updateSource('source-1', { title: 'Updated' });
    });

    expect(mockSourcesApi.update).toHaveBeenCalledWith('source-1', {
      title: 'Updated',
      sourceType: undefined,
      url: undefined,
      rawText: undefined,
      reliabilityCode: undefined,
      credibilityCode: undefined,
      stance: undefined,
      referenceSourceId: undefined,
      referenceMetaSourceId: undefined,
      sourceDate: undefined,
      sourceTime: undefined,
      customMetadata: undefined,
    });
  });

  it('deletes a source from the list', async () => {
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockSourcesApi.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteSource('source-1');
    });

    expect(mockSourcesApi.delete).toHaveBeenCalledWith('source-1');
    expect(result.current.sources).toEqual([]);
  });

  it('adds an attachment to a source', async () => {
    const attachment = {
      id: 'att-1',
      source_id: 'source-1',
      file_name: 'test.jpg',
      relative_path: 'attachments/source-1/test.jpg',
      mime_type: 'image/jpeg',
      file_size: 1024,
      created_at: '2026-01-01T00:00:00Z',
    };
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockFilesApi.saveAttachment.mockResolvedValue('attachments/source-1/test.jpg');
    mockSourcesApi.addAttachment.mockResolvedValue(attachment);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.addAttachment('source-1', file);
    });

    expect(mockFilesApi.saveAttachment).toHaveBeenCalledWith('source-1', 'test.jpg', expect.any(Uint8Array));
    expect(mockSourcesApi.addAttachment).toHaveBeenCalledWith({
      sourceId: 'source-1',
      fileName: 'test.jpg',
      relativePath: 'attachments/source-1/test.jpg',
      mimeType: 'image/jpeg',
      fileSize: file.size,
    });
    // addAttachment updates state directly
    expect(result.current.sources[0].attachments).toHaveLength(1);
  });

  it('deletes an attachment from a source', async () => {
    const sourceWithAtt = { ...mockSource, attachments: [{ id: 'att-1', source_id: 'source-1', file_name: 'test.jpg', relative_path: 'path/test.jpg', mime_type: 'image/jpeg', file_size: 1024, created_at: '2026-01-01T00:00:00Z' }] };
    mockSourcesApi.getAll.mockResolvedValue([sourceWithAtt]);
    mockSourcesApi.deleteAttachment.mockResolvedValue(undefined);
    mockFilesApi.deleteAttachmentFile.mockResolvedValue(undefined);
    mockSourcesApi.getAll.mockResolvedValueOnce([mockSource]);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.deleteAttachment('source-1', 'att-1', 'path/test.jpg');
    });

    expect(mockSourcesApi.deleteAttachment).toHaveBeenCalledWith('att-1');
    expect(mockFilesApi.deleteAttachmentFile).toHaveBeenCalledWith('path/test.jpg');
    expect(result.current.sources[0].attachments).toHaveLength(0);
  });

  it('downloads media from a URL', async () => {
    const attachment = {
      id: 'att-1',
      source_id: 'source-1',
      file_name: 'video.mp4',
      relative_path: 'attachments/source-1/video.mp4',
      mime_type: 'video/mp4',
      file_size: 5000,
      created_at: '2026-01-01T00:00:00Z',
    };
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockFilesApi.downloadMedia.mockResolvedValue(attachment);

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.downloadMedia('source-1', 'https://example.com/video.mp4');
    });

    expect(mockFilesApi.downloadMedia).toHaveBeenCalledWith('source-1', 'https://example.com/video.mp4');
    expect(result.current.sources[0].attachments).toHaveLength(1);
  });

  it('timestamps an attachment', async () => {
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockTimestampApi.timestampAttachment.mockResolvedValue({ id: 'ts-1' });

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.timestampAttachment('att-1');
    });

    expect(mockTimestampApi.timestampAttachment).toHaveBeenCalledWith('att-1');
  });

  it('verifies a timestamp', async () => {
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockTimestampApi.verifyTimestamp.mockResolvedValue({ status: 'confirmed', ots_path: 'path' });

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.verifyTimestamp('att-1');
    });

    expect(mockTimestampApi.verifyTimestamp).toHaveBeenCalledWith('att-1');
  });

  it('gets timestamp status', async () => {
    mockSourcesApi.getAll.mockResolvedValue([mockSource]);
    mockTimestampApi.getTimestampStatus.mockResolvedValue({ status: 'pending' });

    const { result } = renderHook(() => useSources('case-1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.getTimestampStatus('att-1');
    });

    expect(mockTimestampApi.getTimestampStatus).toHaveBeenCalledWith('att-1');
  });

  it('getAttachmentUrl calls filesApi.assetUrl', () => {
    mockFilesApi.assetUrl.mockReturnValue('http://localhost/path');

    const { result } = renderHook(() => useSources('case-1'));

    const url = result.current.getAttachmentUrl('path/file.jpg');
    expect(mockFilesApi.assetUrl).toHaveBeenCalledWith('path/file.jpg');
    expect(url).toBe('http://localhost/path');
  });
});
