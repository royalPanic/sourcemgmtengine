import type { MetaSourceSummary, SourceReference, SourceWithAttachments } from '../types';

/**
 * What the reference dropdown currently points at.
 *
 * The two kinds share one dropdown — that is the point of the feature, since a
 * source may report on either a sibling capture or a standing entity — but they
 * are stored in separate columns, so the selection carries its kind.
 */
export interface ReferenceSelection {
  kind: 'none' | 'source' | 'meta';
  id: string;
}

export const NO_REFERENCE: ReferenceSelection = { kind: 'none', id: '' };

/** Reads the stored reference columns into a single selection. */
export function selectionOf(source: {
  reference_source_id: string | null;
  reference_meta_source_id: string | null;
}): ReferenceSelection {
  if (source.reference_source_id) {
    return { kind: 'source', id: source.reference_source_id };
  }
  if (source.reference_meta_source_id) {
    return { kind: 'meta', id: source.reference_meta_source_id };
  }
  return NO_REFERENCE;
}

/** The two ids a selection maps onto, for the update payload. */
export function referenceIds(selection: ReferenceSelection): {
  referenceSourceId: string;
  referenceMetaSourceId: string;
} {
  return {
    // Empty string clears the column on the backend.
    referenceSourceId: selection.kind === 'source' ? selection.id : '',
    referenceMetaSourceId: selection.kind === 'meta' ? selection.id : '',
  };
}

/** Serialises a selection into the single value an `<option>` carries. */
function optionValue(selection: ReferenceSelection): string {
  return selection.kind === 'none' ? '' : `${selection.kind}:${selection.id}`;
}

/** Parses an `<option>` value back into a selection. */
function parseOptionValue(value: string): ReferenceSelection {
  if (value === '') return NO_REFERENCE;
  const separator = value.indexOf(':');
  if (separator < 0) return NO_REFERENCE;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((kind !== 'source' && kind !== 'meta') || id === '') return NO_REFERENCE;
  return { kind, id };
}

/** The rating a reference currently carries, for seeding the fields. */
export function referenceRating(
  selection: ReferenceSelection,
  siblings: SourceWithAttachments[],
  metaSources: MetaSourceSummary[]
): SourceReference | null {
  if (selection.kind === 'source') {
    const source = siblings.find(s => s.id === selection.id);
    if (!source) return null;
    return {
      kind: 'source',
      id: source.id,
      label: source.title,
      reliability_code: source.reliability_code,
      credibility_code: source.credibility_code,
    };
  }

  if (selection.kind === 'meta') {
    const meta = metaSources.find(m => m.id === selection.id);
    if (!meta) return null;
    return {
      kind: 'meta',
      id: meta.id,
      label: meta.name,
      reliability_code: meta.reliability_code,
      credibility_code: meta.credibility_code,
    };
  }

  return null;
}

interface ReferenceSelectProps {
  /** Current selection. */
  value: ReferenceSelection;
  onChange: (next: ReferenceSelection) => void;
  /** Sibling sources in the same case or event, excluding the one being edited. */
  siblings: SourceWithAttachments[];
  metaSources: MetaSourceSummary[];
  /** Disables the control while a save is in flight. */
  disabled?: boolean;
}

/**
 * Dropdown for "reference source".
 *
 * Options are grouped by kind so the distinction between a capture in this
 * case and a standing entity is visible while choosing.
 */
export function ReferenceSelect({
  value,
  onChange,
  siblings,
  metaSources,
  disabled = false,
}: ReferenceSelectProps) {
  const hasSiblings = siblings.length > 0;
  const hasMeta = metaSources.length > 0;
  const hasOptions = hasSiblings || hasMeta;

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Reference Source</label>
      <select
        value={optionValue(value)}
        onChange={(e) => onChange(parseOptionValue(e.target.value))}
        className="select"
        disabled={disabled || !hasOptions}
      >
        <option value="">None</option>
        {hasSiblings && (
          <optgroup label="This case / event">
            {siblings.map(source => (
              <option key={source.id} value={optionValue({ kind: 'source', id: source.id })}>
                {source.title}
              </option>
            ))}
          </optgroup>
        )}
        {hasMeta && (
          <optgroup label="Meta sources">
            {metaSources.map(meta => (
              <option key={meta.id} value={optionValue({ kind: 'meta', id: meta.id })}>
                {meta.name} ({META_KIND_LABELS[meta.kind]})
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {value.kind === 'none' ? (
        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          {hasOptions
            ? 'Use this when the source reports on a person, organisation, or another capture. Its rating is inherited and it will not count as independent evidence.'
            : 'No other sources or meta sources exist yet.'}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          Rating is inherited from the reference and stays in sync. Stance is disabled:
          repeated reporting of one source must not look like independent corroboration.
        </p>
      )}
    </div>
  );
}

export const META_KIND_LABELS: Record<MetaSourceSummary['kind'], string> = {
  person: 'Person',
  organization: 'Organisation',
  other: 'Other',
};
