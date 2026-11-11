import { useState } from 'react';
import type { EntityQualityWithRefs, QualitySourceRef, QualityType } from '../types';
import {
  RELIABILITY_CODES,
  RELIABILITY_DEFINITIONS,
} from '../types';

interface EntityQualityEditorProps {
  quality: EntityQualityWithRefs | null;
  sources: { id: string; title: string }[];
  onSave: (params: {
    qualityName: string;
    qualityType: QualityType;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }) => Promise<void>;
  onAddSourceRef: (params: {
    sourceId: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => Promise<void>;
  onRemoveSourceRef: (refId: string) => Promise<void>;
  onClose: () => void;
}

export function EntityQualityEditor({
  quality,
  sources,
  onSave,
  onAddSourceRef,
  onRemoveSourceRef,
  onClose,
}: EntityQualityEditorProps) {
  const [qualityName, setQualityName] = useState(quality?.quality_name ?? '');
  const [qualityType, setQualityType] = useState<QualityType>(quality?.quality_type ?? 'string');
  const [valueString, setValueString] = useState(quality?.value_string ?? '');
  const [valueInteger, setValueInteger] = useState(quality?.value_integer ?? '');
  const [valueBoolean, setValueBoolean] = useState(quality?.value_boolean ?? false);
  const [valueDate, setValueDate] = useState(quality?.value_date ?? '');
  const [valueCoordinates, setValueCoordinates] = useState(quality?.value_coordinates ?? '');
  const [valueAddress, setValueAddress] = useState(quality?.value_address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reliability qualities are always named "Reliability" — the name is locked
  // because it drives the entity reliability propagation feature.
  const isReliabilityQuality = qualityType === 'reliability';
  const lockedQualityName = isReliabilityQuality ? 'Reliability' : qualityName;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSave({
        qualityName: isReliabilityQuality ? 'Reliability' : qualityName.trim(),
        qualityType,
        valueString: qualityType === 'string' || qualityType === 'reliability' ? qualityStringValue() : null,
        valueInteger: qualityType === 'integer' ? (valueInteger ? Number(valueInteger) : null) : null,
        valueBoolean: qualityType === 'boolean' ? valueBoolean : null,
        valueDate: qualityType === 'date' ? valueDate || null : null,
        valueCoordinates: qualityType === 'coordinates' ? valueCoordinates || null : null,
        valueAddress: qualityType === 'address' ? valueAddress || null : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const qualityStringValue = (): string | null => {
    switch (qualityType) {
      case 'boolean': return valueBoolean ? 'true' : 'false';
      case 'integer': return valueInteger ? String(valueInteger) : null;
      case 'date': return valueDate || null;
      case 'coordinates': return valueCoordinates || null;
      case 'address': return valueAddress || null;
      default: return valueString || null;
    }
  };

  const handleAddSourceRef = async (sourceId: string) => {
    setError(null);
    try {
      await onAddSourceRef({ sourceId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveSourceRef = async (refId: string) => {
    setError(null);
    try {
      await onRemoveSourceRef(refId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!quality) return null;

  const { reliability, credibility } = quality.source_refs.length > 0
    ? computeAverage(quality.source_refs)
    : { reliability: null, credibility: null };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl mx-4 card p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-1">
          {quality.id ? 'Edit Quality' : 'New Quality'}
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Qualities describe an entity. Each quality can reference sources as provenance.
        </p>

        <form onSubmit={handleSave}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quality Name *</label>
            <input
              type="text"
              value={lockedQualityName}
              onChange={(e) => setQualityName(e.target.value)}
              className="input"
              placeholder="e.g. Name, Date of Birth, Nationality"
              autoFocus
              required
              readOnly={isReliabilityQuality}
            />
            {isReliabilityQuality && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Reliability qualities are always named "Reliability" — the name
                is locked because it drives entity reliability propagation.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Data Type</label>
            <select
              value={qualityType}
              onChange={(e) => setQualityType(e.target.value as QualityType)}
              className="select"
            >
              {QUALITY_TYPE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Value</label>
            {qualityType === 'string' && (
              <input
                type="text"
                value={valueString}
                onChange={(e) => setValueString(e.target.value)}
                className="input"
                placeholder="Enter a string value"
              />
            )}
            {qualityType === 'boolean' && (
              <select
                value={valueBoolean ? 'true' : 'false'}
                onChange={(e) => setValueBoolean(e.target.value === 'true')}
                className="select"
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            )}
            {qualityType === 'integer' && (
              <input
                type="number"
                value={valueInteger}
                onChange={(e) => setValueInteger(e.target.value)}
                className="input"
                placeholder="Enter an integer"
              />
            )}
            {qualityType === 'date' && (
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
                className="input"
              />
            )}
            {qualityType === 'coordinates' && (
              <input
                type="text"
                value={valueCoordinates}
                onChange={(e) => setValueCoordinates(e.target.value)}
                className="input font-mono"
                placeholder="51.507400, -0.127800"
              />
            )}
            {qualityType === 'address' && (
              <input
                type="text"
                value={valueAddress}
                onChange={(e) => setValueAddress(e.target.value)}
                className="input"
                placeholder="Enter an address"
              />
            )}
            {qualityType === 'reliability' && (
              <select
                value={valueString}
                onChange={(e) => setValueString(e.target.value)}
                className="select"
              >
                <option value="">Not rated</option>
                {RELIABILITY_CODES.map(code => (
                  <option key={code} value={code} title={RELIABILITY_DEFINITIONS[code].description}>
                    {RELIABILITY_DEFINITIONS[code].label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Source Provenance</label>
            <p className="text-[11px] text-zinc-500 mb-2">
              Reference one or more sources that support this quality. Their Admiralty ratings
              are averaged below.
            </p>
            <div className="flex gap-2 mb-3">
              <select
                id="source-select"
                className="select flex-1"
              >
                <option value="">Select a source</option>
                {sources.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const select = document.getElementById('source-select') as HTMLSelectElement | null;
                  const sourceId = select?.value;
                  if (sourceId) {
                    void handleAddSourceRef(sourceId);
                    select.value = '';
                  }
                }}
                disabled={submitting}
              >
                Add
              </button>
            </div>

            {quality.source_refs.length > 0 && (
              <div className="space-y-1">
                {quality.source_refs.map(ref => (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between px-3 py-2 border border-zinc-800 rounded bg-zinc-900/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200 truncate max-w-xs">{ref.source_title}</span>
                      {ref.reliability_code && (
                        <span className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {ref.reliability_code}
                        </span>
                      )}
                      {ref.credibility_code && (
                        <span className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {ref.credibility_code}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-red-400 hover:text-red-300"
                      onClick={() => void handleRemoveSourceRef(ref.id)}
                      title="Remove source reference"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {quality.source_refs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-300">Avg Reliability:</span>
                  <span className={reliability ? 'text-amber-400 font-medium' : 'text-zinc-500'}>
                    {reliability ?? '—'}
                  </span>
                  <span className="font-medium text-zinc-300 ml-2">Avg Credibility:</span>
                  <span className={credibility ? 'text-amber-400 font-medium' : 'text-zinc-500'}>
                    {credibility ?? '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !qualityName.trim()}>
              {submitting ? 'Saving…' : 'Save Quality'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const QUALITY_TYPE_OPTIONS: { value: QualityType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'integer', label: 'Integer' },
  { value: 'date', label: 'Date' },
  { value: 'coordinates', label: 'Coordinates' },
  { value: 'address', label: 'Address' },
  { value: 'reliability', label: 'Reliability (A–F)' },
];

function computeAverage(refs: QualitySourceRef[]): {
  reliability: string | null;
  credibility: string | null;
} {
  const reliabilityScores: number[] = [];
  const credibilityScores: number[] = [];

  for (const ref_ of refs) {
    if (ref_.reliability_code) {
      const score = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(ref_.reliability_code) + 1;
      if (score > 0) reliabilityScores.push(score);
    }
    if (ref_.credibility_code != null) {
      credibilityScores.push(ref_.credibility_code);
    }
  }

  const reliability = reliabilityScores.length > 0
    ? ['A', 'B', 'C', 'D', 'E', 'F'][Math.round(reliabilityScores.reduce((a, b) => a + b, 0) / reliabilityScores.length) - 1]
    : null;
  const credibility = credibilityScores.length > 0
    ? Math.round(credibilityScores.reduce((a, b) => a + b, 0) / credibilityScores.length).toString()
    : null;

  return { reliability, credibility };
}