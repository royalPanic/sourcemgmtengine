import { useState } from 'react';
import type { SourceWithAttachments, SourceType, SourceCustomMetadata, Stance, MetaSourceSummary } from '../types';
import { SourceDateTimeFields } from './SourceDateTimeFields';
import { ReferenceSelect, locksStance, referenceIds, referenceRating, type ReferenceSelection } from './ReferenceSelect';
import { formatEventDate } from './Sidebar';
import { formatUtc } from '../utils/datetime';
import {
  SOURCE_TYPES,
  RELIABILITY_CODES,
  CREDIBILITY_CODES,
  RELIABILITY_DEFINITIONS,
  CREDIBILITY_DEFINITIONS,
  STANCES,
  STANCE_DEFINITIONS,
  STANCE_NONE_LABEL,
} from '../types';

interface SourcesGridProps {
  sources: SourceWithAttachments[];
  loading: boolean;
  isEvent: boolean;
  metaSources: MetaSourceSummary[];
  onCreateSource: (params: {
    title: string;
    sourceType: SourceType;
    url?: string;
    rawText?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
    stance?: Stance;
    referenceSourceId?: string;
    referenceMetaSourceId?: string;
    sourceDate?: string;
    sourceTime?: string;
    customMetadata?: SourceCustomMetadata;
  }) => Promise<SourceWithAttachments>;
  onUpdateSource: (id: string, params: Partial<{
    title: string;
    sourceType: SourceType;
    url: string;
    rawText: string;
    reliabilityCode: string;
    credibilityCode: number;
    stance: Stance;
    referenceSourceId: string;
    referenceMetaSourceId: string;
    sourceDate: string;
    sourceTime: string;
    customMetadata: SourceCustomMetadata;
  }>) => Promise<unknown>;
  onDeleteSource: (id: string) => Promise<void>;
  onImportAttachment: (sourceId: string, sourcePath: string) => Promise<unknown>;
  onDeleteAttachment: (sourceId: string, attachmentId: string, relativePath: string) => Promise<void>;
  onOpenAttachment: (relativePath: string) => Promise<void>;
  onOpenDetail: (source: SourceWithAttachments) => void;
}

export function SourcesGrid({
  sources,
  loading,
  isEvent,
  metaSources,
  onCreateSource,
  onDeleteSource,
  onOpenDetail,
}: SourcesGridProps) {
  const [showNewSource, setShowNewSource] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300">
          {sources.length} {sources.length === 1 ? 'Source' : 'Sources'}
        </h2>
        <button type="button" className="btn-primary" onClick={() => setShowNewSource(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Source
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <svg className="mx-auto h-12 w-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <p className="text-sm">No sources yet</p>
            <p className="text-xs mt-1">Add a source to begin evaluating intelligence</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Admiralty</th>
                {isEvent && <th className="px-4 py-2 font-medium">Stance</th>}
                <th className="px-4 py-2 font-medium">Attachments</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sources.map(source => (
                <tr
                  key={source.id}
                  className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => onOpenDetail(source)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-100 truncate max-w-xs">{source.title}</div>
                    {source.reference && (
                      <div
                        className="text-xs text-amber-400/70 truncate max-w-xs"
                        title={
                          source.reference.kind === 'meta'
                            ? 'References a meta source'
                            : 'References another source in this container'
                        }
                      >
                        via {source.reference.label}
                        {source.reference.kind === 'meta' && (
                          <span className="text-zinc-500"> · meta</span>
                        )}
                      </div>
                    )}
                    {source.url && (
                      <div className="text-xs text-zinc-500 truncate max-w-xs">{source.url}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{source.source_type}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {source.source_date ? (
                      <>
                        <div>{formatEventDate(source.source_date, source.source_time)}</div>
                        {source.source_time && (
                          <div className="text-[11px] text-zinc-500 font-mono">
                            {formatUtc(source.source_date, source.source_time)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-600">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {source.reliability_code ? (
                        <span
                          className={`badge-reliability-${source.reliability_code.toLowerCase()}`}
                          title={RELIABILITY_DEFINITIONS[source.reliability_code].description}
                        >
                          {source.reliability_code}
                        </span>
                      ) : (
                        <span className="text-zinc-600">–</span>
                      )}
                      {source.credibility_code ? (
                        <span
                          className={`badge-credibility-${source.credibility_code}`}
                          title={CREDIBILITY_DEFINITIONS[source.credibility_code].description}
                        >
                          {source.credibility_code}
                        </span>
                      ) : (
                        <span className="text-zinc-600">–</span>
                      )}
                    </div>
                  </td>
                  {isEvent && (
                    <td className="px-4 py-3">
                      <StanceBadge stance={source.stance} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-zinc-400">{source.attachments.length}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(source.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20"
                      title="Delete source"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete source "${source.title}"?`)) {
                          void onDeleteSource(source.id);
                        }
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewSource && (
        <NewSourceModal
          isEvent={isEvent}
          siblings={sources}
          metaSources={metaSources}
          onClose={() => setShowNewSource(false)}
          onSubmit={async (params) => {
            await onCreateSource(params);
            setShowNewSource(false);
          }}
        />
      )}
    </div>
  );
}

export function StanceBadge({ stance }: { stance: Stance | null }) {
  if (!stance) {
    return <span className="text-zinc-600 text-xs">–</span>;
  }

  const styles: Record<Stance, string> = {
    supports: 'badge bg-emerald-500/20 text-emerald-400',
    refutes: 'badge bg-red-500/20 text-red-400',
    neutral: 'badge bg-zinc-500/20 text-zinc-300',
  };

  return (
    <span className={styles[stance]} title={STANCE_DEFINITIONS[stance].description}>
      {STANCE_DEFINITIONS[stance].label}
    </span>
  );
}

function NewSourceModal({
  isEvent,
  siblings,
  metaSources,
  onClose,
  onSubmit,
}: {
  isEvent: boolean;
  siblings: SourceWithAttachments[];
  metaSources: MetaSourceSummary[];
  onClose: () => void;
  onSubmit: (params: {
    title: string;
    sourceType: SourceType;
    url?: string;
    rawText?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
    stance?: Stance;
    referenceSourceId?: string;
    referenceMetaSourceId?: string;
    sourceDate?: string;
    sourceTime?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('URL');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [reliabilityCode, setReliabilityCode] = useState('');
  const [credibilityCode, setCredibilityCode] = useState('');
  const [stance, setStance] = useState('');
  const [reference, setReference] = useState<ReferenceSelection>({ kind: 'none', id: '' });
  const [sourceDate, setSourceDate] = useState('');
  const [sourceTime, setSourceTime] = useState('');
  const [timeValid, setTimeValid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const isReferenced = locksStance(reference);
      await onSubmit({
        title: title.trim(),
        sourceType,
        url: url.trim() || undefined,
        rawText: rawText.trim() || undefined,
        reliabilityCode: reliabilityCode || undefined,
        credibilityCode: credibilityCode ? Number(credibilityCode) : undefined,
        // A source that duplicates another capture carries no stance; the
        // backend enforces this too. Meta-referenced sources keep theirs.
        stance: isEvent && !isReferenced && stance ? (stance as Stance) : undefined,
        ...referenceIds(reference),
        sourceDate: sourceDate || undefined,
        sourceTime: sourceDate && sourceTime ? sourceTime : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 card p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Add Source</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Source title"
              autoFocus
              required
            />
          </div>

          <div className="mb-4">
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

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Raw Text</label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="textarea"
              placeholder="Captured source content"
              rows={3}
            />
          </div>

          <div className="mb-4">
            <SourceDateTimeFields
              date={sourceDate}
              time={sourceTime}
              onChange={({ date, time }) => {
                setSourceDate(date);
                setSourceTime(time);
              }}
              onValidityChange={setTimeValid}
            />
          </div>

          <div className="mb-4">
            <ReferenceSelect
              value={reference}
              siblings={siblings}
              metaSources={metaSources}
              disabled={submitting}
              onChange={(next) => {
                setReference(next);
                // Mirror the reference's rating as the default.
                const rating = referenceRating(next, siblings, metaSources);
                setReliabilityCode(rating?.reliability_code ?? '');
                setCredibilityCode(
                  rating?.credibility_code ? String(rating.credibility_code) : ''
                );
                if (locksStance(next)) setStance('');
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Source Reliability</label>
              <select
                value={reliabilityCode}
                onChange={(e) => setReliabilityCode(e.target.value)}
                className="select"
              >
                <option value="">Not rated</option>
                {RELIABILITY_CODES.map(code => (
                  <option key={code} value={code} title={RELIABILITY_DEFINITIONS[code].description}>
                    {RELIABILITY_DEFINITIONS[code].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Information Credibility</label>
              <select
                value={credibilityCode}
                onChange={(e) => setCredibilityCode(e.target.value)}
                className="select"
              >
                <option value="">Not rated</option>
                {CREDIBILITY_CODES.map(code => (
                  <option key={code} value={code} title={CREDIBILITY_DEFINITIONS[code].description}>
                    {CREDIBILITY_DEFINITIONS[code].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isEvent && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Stance on Event</label>
              <select
                value={locksStance(reference) ? '' : stance}
                onChange={(e) => setStance(e.target.value)}
                className="select"
                disabled={locksStance(reference)}
                title={
                  locksStance(reference)
                    ? 'A source that duplicates another capture carries no stance'
                    : undefined
                }
              >
                <option value="">{STANCE_NONE_LABEL}</option>
                {STANCES.map(value => (
                  <option key={value} value={value} title={STANCE_DEFINITIONS[value].description}>
                    {STANCE_DEFINITIONS[value].label}
                  </option>
                ))}
              </select>
              {locksStance(reference) ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Locked to none: this duplicates another capture.
                </p>
              ) : stance ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {STANCE_DEFINITIONS[stance as Stance].description}
                </p>
              ) : null}
            </div>
          )}

          {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim() || !timeValid}>
              {submitting ? 'Adding…' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}