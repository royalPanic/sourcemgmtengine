import { useId } from 'react';
import type { Entity, SourceReference, SourceWithAttachments } from '../types';

/**
 * What the reference dropdown currently points at.
 *
 * The two kinds share one dropdown — that is the point of the feature, since a
 * source may report on either a sibling capture or a standing entity — but they
 * are stored in separate columns, so the selection carries its kind.
 */
export interface ReferenceSelection {
  kind: 'none' | 'source' | 'entity';
  id: string;
}

export const NO_REFERENCE: ReferenceSelection = { kind: 'none', id: '' };

/**
 * True when the selection suppresses the stance.
 *
 * A sibling capture duplicates one piece of evidence, so it must not express a
 * stance. An entity is a standing actor that may publish several viewpoints,
 * so its citations stay classifiable.
 */
export function locksStance(selection: ReferenceSelection): boolean {
  return selection.kind === 'source';
}

/** Reads the stored reference columns into a single selection. */
export function selectionOf(source: {
  reference_source_id: string | null;
  reference_entity_id: string | null;
}): ReferenceSelection {
  if (source.reference_source_id) {
    return { kind: 'source', id: source.reference_source_id };
  }
  if (source.reference_entity_id) {
    return { kind: 'entity', id: source.reference_entity_id };
  }
  return NO_REFERENCE;
}

/** The two ids a selection maps onto, for the update payload. */
export function referenceIds(selection: ReferenceSelection): {
  referenceSourceId: string;
  referenceEntityId: string;
} {
  return {
    // Empty string clears the column on the backend.
    referenceSourceId: selection.kind === 'source' ? selection.id : '',
    referenceEntityId: selection.kind === 'entity' ? selection.id : '',
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
  if ((kind !== 'source' && kind !== 'entity') || id === '') return NO_REFERENCE;
  return { kind, id };
}

/**
 * Which rating fields a reference supplies, mirroring the backend rule.
 *
 * A source reference duplicates one capture, so it supplies both codes. An
 * entity reference supplies only reliability — credibility is this source's own
 * assessment of this information, so the operator's value must survive.
 */
export function referenceSupplies(selection: ReferenceSelection): {
  reliability: boolean;
  credibility: boolean;
} {
  return {
    reliability: selection.kind !== 'none',
    credibility: selection.kind === 'source',
  };
}

/** The rating a reference currently carries, for seeding the fields. */
export function referenceRating(
  selection: ReferenceSelection,
  siblings: SourceWithAttachments[],
  entities: Entity[]
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

  if (selection.kind === 'entity') {
    const entity = entities.find(e => e.id === selection.id);
    if (!entity) return null;
    return {
      kind: 'entity',
      id: entity.id,
      label: entity.name,
      reliability_code: null,
      credibility_code: null,
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
  entities: Entity[];
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
  entities,
  disabled = false,
}: ReferenceSelectProps) {
  const hasSiblings = siblings.length > 0;
  const hasEntities = entities.length > 0;
  const hasOptions = hasSiblings || hasEntities;
  // The drawer and the new-source modal can both be mounted, so the label needs
  // an id unique to this instance.
  const selectId = useId();

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium mb-1">
        Reference Source
      </label>
      <select
        id={selectId}
        value={optionValue(value)}
        onChange={(e) => onChange(parseOptionValue(e.target.value))}
        className="select"
        disabled={disabled || !hasOptions}
      >
        <option value="">None</option>
        {hasSiblings && (
          <optgroup label="This case / event">
            {siblings.map(source => (
              <option key={source.id} value={optionValue({ kind: 'source', id: source.id })} >
                {source.title}
              </option>
            ))}
          </optgroup>
        )}
        {hasEntities && (
          <optgroup label="Entities">
            {entities.map(entity => (
              <option key={entity.id} value={optionValue({ kind: 'entity', id: entity.id })} >
                {entity.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {value.kind === 'none' ? (
        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          {hasOptions
            ? 'Use this when the source reports on a person, organisation, or another capture. Its rating is inherited from the reference.'
            : 'No other sources or entities exist yet.'}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          Rating is inherited from the reference and stays in sync.{' '}
          {locksStance(value)
            ? 'Stance is disabled: this duplicates another capture, so it must not count as independent corroboration.'
            : 'Stance stays editable: an entity can express several viewpoints.'}
        </p>
      )}
    </div>
  );
}
