import { useEffect, useState } from 'react';
import type { SourceAttachment } from '../types';
import { mediaKind } from '../types';

interface MediaPreviewProps {
  attachment: SourceAttachment;
  resolveUrl: (relativePath: string) => Promise<string>;
  onOpen: (relativePath: string) => void;
  onDelete: (attachment: SourceAttachment) => void;
}

/**
 * Renders an inline preview for image, video, and audio attachments.
 * Anything else falls back to a file row with an "open externally" action.
 */
export function MediaPreview({ attachment, resolveUrl, onOpen, onDelete }: MediaPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const kind = mediaKind(attachment);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    if (kind === 'other') return;

    resolveUrl(attachment.relative_path)
      .then(resolved => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.relative_path, kind, resolveUrl]);

  const meta = (
    <div className="text-[11px] text-zinc-500">
      {attachment.mime_type ?? 'unknown type'}
      {attachment.file_size != null && ` · ${formatBytes(attachment.file_size)}`}
    </div>
  );

  const deleteButton = (
    <button
      type="button"
      className="btn-ghost p-1 text-red-400 hover:bg-red-600/20 shrink-0"
      title="Delete attachment"
      onClick={() => onDelete(attachment)}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );

  if (kind === 'other') {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <button
            type="button"
            className="flex-1 min-w-0 text-left"
            onClick={() => onOpen(attachment.relative_path)}
            title="Open in default application"
          >
            <div className="text-xs text-zinc-300 truncate">{attachment.file_name}</div>
            {meta}
          </button>
          {deleteButton}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="bg-zinc-950/60 flex items-center justify-center min-h-[80px]">
        {failed && (
          <div className="text-[11px] text-zinc-500 py-6 px-3 text-center">
            Preview unavailable — the file may have been moved or deleted.
          </div>
        )}
        {!failed && !url && (
          <div className="py-6">
            <svg className="animate-spin h-4 w-4 text-amber-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
        {!failed && url && kind === 'image' && (
          <img
            src={url}
            alt={attachment.file_name}
            className="max-h-56 w-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
        {!failed && url && kind === 'video' && (
          <video
            src={url}
            controls
            preload="metadata"
            className="max-h-56 w-full"
            onError={() => setFailed(true)}
          />
        )}
        {!failed && url && kind === 'audio' && (
          <audio
            src={url}
            controls
            preload="metadata"
            className="w-full px-2 py-3"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={() => onOpen(attachment.relative_path)}
          title="Open in default application"
        >
          <div className="text-xs text-zinc-300 truncate">{attachment.file_name}</div>
          {meta}
        </button>
        {deleteButton}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}