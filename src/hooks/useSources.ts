import { useState, useEffect, useCallback } from 'react';
import { sourcesApi, filesApi, timestampApi } from '../api/tauri';
import type {
  SourceWithAttachments,
  SourceType,
  SourceCustomMetadata,
  Stance,
  TimestampRecord,
} from '../types';

export function useSources(caseId: string | null) {
  const [sources, setSources] = useState<SourceWithAttachments[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    if (!caseId) {
      setSources([]);
      return;
    }
    try {
      setLoading(true);
      const data = await sourcesApi.getAll(caseId);
      setSources(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  /**
   * Re-reads the whole list without touching the loading flag.
   *
   * A write can change rows other than the one being edited: a source's rating
   * propagates to every source that cites it, so patching the single edited row
   * in place would leave siblings stale.
   */
  const reloadQuietly = useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await sourcesApi.getAll(caseId);
      setSources(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh sources');
    }
  }, [caseId]);

  const createSource = async (params: {
    title: string;
    sourceType: SourceType;
    url?: string;
    rawText?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
    stance?: Stance;
    referenceSourceId?: string;
    referenceEntityId?: string;
    sourceDate?: string;
    sourceTime?: string;
    customMetadata?: SourceCustomMetadata;
  }) => {
    if (!caseId) throw new Error('No case selected');
    const newSource = await sourcesApi.create({ caseId, ...params });
    const withDetails = await sourcesApi.get(newSource.id);
    const created = withDetails ?? { ...newSource, attachments: [], reference: null };

    setSources(prev => [created, ...prev]);
    // Picking a source reference re-rates this row, and the reference itself may
    // have had its rating mirrored, so refresh the rest too.
    await reloadQuietly();
    return created;
  };

  const updateSource = async (id: string, params: Partial<{
    title: string;
    sourceType: SourceType;
    url: string;
    rawText: string;
    reliabilityCode: string;
    credibilityCode: number;
    stance: Stance | '';
    referenceSourceId: string;
    referenceEntityId: string;
    sourceDate: string;
    sourceTime: string;
    customMetadata: SourceCustomMetadata;
  }>) => {
    const updated = await sourcesApi.update(id, params);

    // A rating change propagates to every source that cites this one, so those
    // rows have to be re-read. A plain edit touches only this row, which is
    // already patched in place below — refetching the whole list for a title
    // change is wasted work.
    const ratingTouched =
      params.reliabilityCode !== undefined ||
      params.credibilityCode !== undefined ||
      params.referenceSourceId !== undefined ||
      params.referenceEntityId !== undefined;

    if (ratingTouched) {
      await reloadQuietly();
    } else {
      setSources(prev => prev.map(s => (s.id === id ? { ...s, ...updated } : s)));
    }

    return updated;
  };

  const deleteSource = async (id: string) => {
    await sourcesApi.delete(id);
    setSources(prev => prev.filter(s => s.id !== id));
    // Deleting a referenced source clears its citation links in SQLite; reload
    // so citing rows stop showing a reference that no longer exists.
    await reloadQuietly();
  };

  /**
   * Imports a file the user picked from disk. The copy happens in Rust so the
   * bytes never travel through the webview.
   */
  const importAttachment = async (sourceId: string, sourcePath: string) => {
    const imported = await filesApi.importAttachment(sourceId, sourcePath);

    const attachment = await sourcesApi.addAttachment({
      sourceId,
      fileName: imported.file_name,
      relativePath: imported.relative_path,
      mimeType: imported.mime_type,
      fileSize: imported.file_size,
    });

    setSources(prev => prev.map(s =>
      s.id === sourceId
        ? { ...s, attachments: [...s.attachments, attachment] }
        : s
    ));

    return attachment;
  };

  const deleteAttachment = async (sourceId: string, attachmentId: string, relativePath: string) => {
    await sourcesApi.deleteAttachment(attachmentId);
    await filesApi.deleteAttachmentFile(relativePath);
    setSources(prev => prev.map(s =>
      s.id === sourceId
        ? { ...s, attachments: s.attachments.filter(a => a.id !== attachmentId) }
        : s
    ));
  };

  /**
   * Downloads media from a source URL using the bundled yt-dlp sidecar and
   * stores it as an attachment on the source. Network is only used when this
   * is explicitly invoked.
   */
  const downloadMedia = async (sourceId: string, url: string) => {
    const attachment = await filesApi.downloadMedia(sourceId, url);
    setSources(prev => prev.map(s =>
      s.id === sourceId
        ? { ...s, attachments: [...s.attachments, attachment] }
        : s
    ));
    return attachment;
  };

  const openAttachment = async (relativePath: string) => {
    await filesApi.openAttachment(relativePath);
  };

  const getAttachmentUrl = (relativePath: string) => filesApi.assetUrl(relativePath);

  /**
   * Creates an OpenTimestamps timestamp proof for an attachment.
   */
  const timestampAttachment = useCallback(async (attachmentId: string): Promise<TimestampRecord> => {
    return timestampApi.timestampAttachment(attachmentId);
  }, []);

  /**
   * Re-checks an existing timestamp proof against the calendars and the
   * Bitcoin blockchain, upgrading it if a confirmation is now available.
   */
  const verifyTimestamp = useCallback(async (attachmentId: string): Promise<TimestampRecord> => {
    return timestampApi.verifyTimestamp(attachmentId);
  }, []);

  /**
   * Gets the timestamp record for an attachment, if any.
   */
  const getTimestampStatus = useCallback(async (attachmentId: string): Promise<TimestampRecord | null> => {
    return timestampApi.getTimestampStatus(attachmentId);
  }, []);

  return {
    sources,
    loading,
    error,
    loadSources,
    reloadQuietly,
    createSource,
    updateSource,
    deleteSource,
    importAttachment,
    deleteAttachment,
    openAttachment,
    getAttachmentUrl,
    downloadMedia,
    timestampAttachment,
    verifyTimestamp,
    getTimestampStatus,
  };
}
