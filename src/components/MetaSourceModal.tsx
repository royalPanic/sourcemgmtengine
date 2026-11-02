import { useState } from 'react';
import type { MetaSource, MetaSourceKind } from '../types';
import {
  CREDIBILITY_CODES,
  CREDIBILITY_DEFINITIONS,
  RELIABILITY_CODES,
  RELIABILITY_DEFINITIONS,
} from '../types';
import { META_KIND_LABELS } from './ReferenceSelect';

const META_KINDS: MetaSourceKind[] = ['person', 'organization', 'other'];

interface MetaSourceModalProps {
  /** Omit to create; pass a meta source to edit it. */
  metaSource?: MetaSource | null;
  onClose: () => void;
  onSubmit: (params: {
    name: string;
    kind: MetaSourceKind;
    description?: string;
    url?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => Promise<void>;
}

/**
 * Create/edit form for a meta source.
 *
 * The Admiralty fields matter more here than anywhere else: this rating is what
 * every citing source inherits, so it is the single place a news agency's
 * standing is recorded.
 */
export function MetaSourceModal({ metaSource, onClose, onSubmit }: MetaSourceModalProps) {
  const isEdit = Boolean(metaSource);

  const [name, setName] = useState(metaSource?.name ?? '');
  const [kind, setKind] = useState<MetaSourceKind>(metaSource?.kind ?? 'organization');
  const [description, setDescription] = useState(metaSource?.description ?? '');
  const [url, setUrl] = useState(metaSource?.url ?? '');
  const [reliabilityCode, setReliabilityCode] = useState(metaSource?.reliability_code ?? '');
  const [credibilityCode, setCredibilityCode] = useState(
    metaSource?.credibility_code ? String(metaSource.credibility_code) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        description: description.trim() || undefined,
        url: url.trim() || undefined,
        reliabilityCode: reliabilityCode || undefined,
        credibilityCode: credibilityCode ? Number(credibilityCode) : undefined,
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
        <h2 className="text-xl font-semibold mb-1">
          {isEdit ? 'Edit Meta Source' : 'New Meta Source'}
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Meta sources are global: they persist across every case and event, and sources that
          reference them inherit their rating.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Reuters, BBC Monitoring, Jane Doe…"
              autoFocus
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MetaSourceKind)}
              className="select"
            >
              {META_KINDS.map(value => (
                <option key={value} value={value}>{META_KIND_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Reliability (A–F)</label>
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
              <label className="block text-sm font-medium mb-1">Credibility (1–6)</label>
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

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea min-h-[80px]"
              placeholder="Who or what this entity is, and why it is rated as it is"
              rows={3}
            />
          </div>

          {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Meta Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
