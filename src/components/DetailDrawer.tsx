import { useEffect, useState } from 'react';
import type { SourceWithAttachments, SourceType, SourceCustomMetadata } from '../types';
import {
  SOURCE_TYPES,
  RELIABILITY_CODES,
  CREDIBILITY_CODES,
  RELIABILITY_DEFINITIONS,
  CREDIBILITY_DEFINITIONS,
} from '../types';

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  source: SourceWithAttachments | null;
  onUpdate: (id: string, params: Partial<{
    title: string;
    sourceType: SourceType;
    url: string;
    rawText: string;
    reliabilityCode: string;
    credibilityCode: number;
    customMetadata: SourceCustomMetadata;
  }>) => Promise<unknown>;
  onAddAttachment: (sourceId: string, file: File) => Promise<unknown>;
  onDeleteAttachment: (sourceId: string, attachmentId: string, relativePath: string) => Promise<void>;
  onOpenAttachment: (relativePath: string) => Promise<void>;
}

export function DetailDrawer({
  isOpen,
  onClose,
  source,
  onUpdate,
  onAddAttachment,
  onDeleteAttachment,
  onOpenAttachment,
}: DetailDrawerProps) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('URL');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [reliabilityCode, setReliabilityCode] = useState('');
  const [credibilityCode, setCredibilityCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!source) return;
    setTitle(source.title);
    setSourceType(source.source_type);
    setUrl(source.url ?? '');
    setRawText(source.raw_text ?? '');
    setReliabilityCode(source.reliability_code ?? '');
    setCredibilityCode(source.credibility_code ? String(source.credibility_code) : '');
  }, [source]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !source) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(source.id, {
        title: title.trim(),
        sourceType,
        url,
        rawText,
        reliabilityCode,
        credibilityCode: credibilityCode ? Number(credibilityCode) : 0,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onAddAttachment(source.id, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Source Details</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" title="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="select"
            >
              {SOURCE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="input" placeholder="https://…" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Raw Text</label>
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} className="textarea" rows={5} />
          </div>

          <section className="card p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">NATO Admiralty Rating</h3>

            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Source Reliability (A–F)</label>
              <select value={reliabilityCode} onChange={(e) => setReliabilityCode(e.target.value)} className="select">
                <option value="">Not rated</option>
                {RELIABILITY_CODES.map(code => (
                  <option key={code} value={code}>{RELIABILITY_DEFINITIONS[code].label}</option>
                ))}
              </select>
              {reliabilityCode && (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {RELIABILITY_DEFINITIONS[reliabilityCode as keyof typeof RELIABILITY_DEFINITIONS].description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Information Credibility (1–6)</label>
              <select value={credibilityCode} onChange={(e) => setCredibilityCode(e.target.value)} className="select">
                <option value="">Not rated</option>
                {CREDIBILITY_CODES.map(code => (
                  <option key={code} value={code}>{CREDIBILITY_DEFINITIONS[code].label}</option>
                ))}
              </select>
              {credibilityCode && (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {CREDIBILITY_DEFINITIONS[Number(credibilityCode) as keyof typeof CREDIBILITY_DEFINITIONS].description}
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">
                Attachments ({source.attachments.length})
              </h3>
              <label className="btn-secondary cursor-pointer">
                {uploading ? 'Uploading…' : 'Attach File'}
                <input type="file" className="hidden" onChange={handleFilePick} disabled={uploading} />
              </label>
            </div>

            {source.attachments.length === 0 ? (
              <p className="text-xs text-zinc-500">No attachments.</p>
            ) : (
              <ul className="space-y-1">
                {source.attachments.map(attachment => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => void onOpenAttachment(attachment.relative_path)}
                      title="Open attachment"
                    >
                      <div className="text-sm text-zinc-200 truncate">{attachment.file_name}</div>
                      <div className="text-xs text-zinc-500">
                        {attachment.mime_type ?? 'unknown type'}
                        {attachment.file_size != null && ` · ${formatBytes(attachment.file_size)}`}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20"
                      title="Delete attachment"
                      onClick={() => {
                        if (window.confirm(`Delete attachment "${attachment.file_name}"?`)) {
                          void onDeleteAttachment(source.id, attachment.id, attachment.relative_path);
                        }
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Custom Metadata</h3>
            <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto">
              {formatMetadata(source.custom_metadata)}
            </pre>
          </section>
        </div>

        <footer className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-800">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Close
          </button>
          <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function formatMetadata(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
