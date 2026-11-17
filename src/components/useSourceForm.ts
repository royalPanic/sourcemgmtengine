import { useState } from 'react';
import type {
  Entity,
  SourceType,
  SourceWithAttachments,
  Stance,
} from '../types';
import {
  locksStance,
  referenceIds,
  referenceRating,
  referenceSupplies,
  type ReferenceSelection,
} from './ReferenceSelect';

/** The values the form has assembled, ready to send to the backend. */
export interface SourceFormValues {
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
}

/** The fields a caller can seed when editing an existing source. */
export interface SourceFormInitial {
  title?: string;
  sourceType?: SourceType;
  url?: string | null;
  rawText?: string | null;
  reliabilityCode?: string | null;
  credibilityCode?: number | null;
  stance?: Stance | null;
  reference?: ReferenceSelection;
  sourceDate?: string | null;
  sourceTime?: string | null;
}

interface UseSourceFormOptions {
  siblings: SourceWithAttachments[];
  entities: Entity[];
  initial?: SourceFormInitial;
}

/**
 * The shared state and rules behind both source forms.
 *
 * The "Add Source" modal and the detail drawer edit the same fields under the
 * same rules — picking a reference seeds the rating, a *source* reference locks
 * the stance, and a time without a date is meaningless — so that logic lives
 * here instead of being written twice.
 */
export function useSourceForm({ siblings, entities, initial }: UseSourceFormOptions) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sourceType, setSourceType] = useState<SourceType>(initial?.sourceType ?? 'URL');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [rawText, setRawText] = useState(initial?.rawText ?? '');
  const [reliabilityCode, setReliabilityCode] = useState(initial?.reliabilityCode ?? '');
  const [credibilityCode, setCredibilityCode] = useState(
    initial?.credibilityCode ? String(initial.credibilityCode) : ''
  );
  const [stance, setStance] = useState(initial?.stance ?? '');
  const [reference, setReference] = useState<ReferenceSelection>(
    initial?.reference ?? { kind: 'none', id: '' }
  );
  const [sourceDate, setSourceDate] = useState(initial?.sourceDate ?? '');
  const [sourceTime, setSourceTime] = useState(initial?.sourceTime ?? '');
  const [timeValid, setTimeValid] = useState(true);

  // Mirrors the reference's rating into the fields so the inheritance is
  // visible before the operator commits. An entity supplies only reliability,
  // so the operator's own credibility assessment survives.
  const applyReference = (next: ReferenceSelection) => {
    setReference(next);

    const rating = referenceRating(next, siblings, entities);
    const supplies = referenceSupplies(next);

    if (supplies.reliability) {
      setReliabilityCode(rating?.reliability_code ?? '');
    }
    if (supplies.credibility) {
      setCredibilityCode(rating?.credibility_code ? String(rating.credibility_code) : '');
    }
    // Only a duplicate of another capture loses its stance.
    if (locksStance(next)) setStance('');
  };

  const stanceLocked = locksStance(reference);

  /** Assembles the current values, or `null` when the title is blank. */
  const values = (): SourceFormValues | null => {
    if (!title.trim()) return null;

    return {
      title: title.trim(),
      sourceType,
      url: url.trim() || undefined,
      rawText: rawText.trim() || undefined,
      reliabilityCode: reliabilityCode || undefined,
      credibilityCode: credibilityCode ? Number(credibilityCode) : undefined,
      // A source that duplicates another capture carries no stance; the
      // backend enforces this too. Entity-referenced sources keep theirs.
      stance: !stanceLocked && stance ? (stance as Stance) : undefined,
      ...referenceIds(reference),
      sourceDate: sourceDate || undefined,
      sourceTime: sourceDate && sourceTime ? sourceTime : undefined,
    };
  };

  return {
    title,
    setTitle,
    sourceType,
    setSourceType,
    url,
    setUrl,
    rawText,
    setRawText,
    reliabilityCode,
    setReliabilityCode,
    credibilityCode,
    setCredibilityCode,
    stance,
    setStance,
    reference,
    setReference: applyReference,
    sourceDate,
    setSourceDate,
    sourceTime,
    setSourceTime,
    timeValid,
    setTimeValid,
    stanceLocked,
    values,
    /** True when the form has everything needed to submit. */
    canSubmit: title.trim() !== '' && timeValid,
  };
}

export type SourceFormState = ReturnType<typeof useSourceForm>;