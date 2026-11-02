import type {
  SourceWithAttachments,
  Stance,
  ReliabilityCode,
  CredibilityCode,
} from '../types';
import { RELIABILITY_CODES, CREDIBILITY_CODES } from '../types';

/** A stance bucket, plus `none` for sources with no stance recorded. */
export type StanceBucket = Stance | 'none';

export const STANCE_BUCKETS: StanceBucket[] = ['supports', 'refutes', 'neutral', 'none'];

export const STANCE_BUCKET_LABELS: Record<StanceBucket, string> = {
  supports: 'Supports',
  refutes: 'Refutes',
  neutral: 'Neutral',
  none: 'None / N/A',
};

/**
 * Numeric weight for a reliability code. A is the most reliable, so it maps to
 * the lowest score — averaging then reads the same way as the Admiralty scale:
 * lower is better.
 */
export const RELIABILITY_SCORES: Record<ReliabilityCode, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
};

/** Credibility codes are already 1–6 with lower being better. */
export const CREDIBILITY_SCORES: Record<CredibilityCode, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

/** The "cannot be judged" values, which the user may exclude from averages. */
export const UNJUDGEABLE_RELIABILITY: ReliabilityCode = 'F';
export const UNJUDGEABLE_CREDIBILITY: CredibilityCode = 6;

export interface AnalyticsOptions {
  /**
   * Drop F reliability and 6 credibility from the averages. Filtering is
   * per-dimension: a source rated F/2 still contributes to the credibility
   * average, because only its reliability is unjudgeable.
   */
  excludeUnjudgeable: boolean;
}

export interface DimensionStats {
  /** Sources contributing to the average. */
  rated: number;
  /** Sources dropped because their rating cannot be judged. */
  excluded: number;
  /** Mean score on the 1–6 scale, or null when nothing is rated. */
  average: number | null;
  /** Nearest Admiralty code for the average, or null. */
  label: string | null;
}

export interface StanceStats {
  bucket: StanceBucket;
  /** Total sources in this bucket, regardless of rating. */
  total: number;
  reliability: DimensionStats;
  credibility: DimensionStats;
}

export interface EventAnalytics {
  totalSources: number;
  /** Sources with no stance recorded. */
  unassigned: number;
  byStance: StanceStats[];
  /** Aggregate across every source, ignoring stance. */
  overall: {
    reliability: DimensionStats;
    credibility: DimensionStats;
  };
}

function bucketOf(source: SourceWithAttachments): StanceBucket {
  return source.stance ?? 'none';
}

/**
 * True when a source cites another, which makes it a report *of* something
 * rather than independent evidence.
 *
 * Such sources are excluded from every dashboard statistic: ten outlets
 * repeating one core source would otherwise inflate both the source count and
 * the apparent weight of whatever stance those outlets lean toward.
 */
export function isReferenceLinked(source: SourceWithAttachments): boolean {
  return Boolean(source.reference_source_id || source.reference_meta_source_id);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Nearest reliability letter for a 1–6 average. */
export function scoreToReliabilityLabel(score: number): ReliabilityCode {
  const index = Math.min(
    RELIABILITY_CODES.length - 1,
    Math.max(0, Math.round(score) - 1)
  );
  return RELIABILITY_CODES[index];
}

/** Nearest credibility digit for a 1–6 average. */
export function scoreToCredibilityLabel(score: number): CredibilityCode {
  const index = Math.min(
    CREDIBILITY_CODES.length - 1,
    Math.max(0, Math.round(score) - 1)
  );
  return CREDIBILITY_CODES[index];
}

function summarizeReliability(
  sources: SourceWithAttachments[],
  options: AnalyticsOptions
): DimensionStats {
  const scores: number[] = [];
  let excluded = 0;

  for (const source of sources) {
    const code = source.reliability_code;
    if (!code) continue;

    if (options.excludeUnjudgeable && code === UNJUDGEABLE_RELIABILITY) {
      excluded += 1;
      continue;
    }

    const score = RELIABILITY_SCORES[code];
    if (typeof score === 'number') scores.push(score);
  }

  const average = mean(scores);
  return {
    rated: scores.length,
    excluded,
    average,
    label: average === null ? null : scoreToReliabilityLabel(average),
  };
}

function summarizeCredibility(
  sources: SourceWithAttachments[],
  options: AnalyticsOptions
): DimensionStats {
  const scores: number[] = [];
  let excluded = 0;

  for (const source of sources) {
    const code = source.credibility_code;
    if (code == null) continue;

    if (options.excludeUnjudgeable && code === UNJUDGEABLE_CREDIBILITY) {
      excluded += 1;
      continue;
    }

    const score = CREDIBILITY_SCORES[code];
    if (typeof score === 'number') scores.push(score);
  }

  const average = mean(scores);
  return {
    rated: scores.length,
    excluded,
    average,
    label: average === null ? null : String(scoreToCredibilityLabel(average)),
  };
}

/**
 * Computes per-stance Admiralty averages for an event.
 *
 * Reference-linked sources are dropped entirely — see [`isReferenceLinked`].
 * Remaining sources with no stance fall into the `none` bucket so the totals
 * always reconcile with the source count that is actually being measured.
 */
export function computeEventAnalytics(
  sources: SourceWithAttachments[],
  options: AnalyticsOptions
): EventAnalytics {
  const independent = sources.filter(source => !isReferenceLinked(source));

  const grouped = new Map<StanceBucket, SourceWithAttachments[]>();
  for (const bucket of STANCE_BUCKETS) grouped.set(bucket, []);

  for (const source of independent) {
    grouped.get(bucketOf(source))!.push(source);
  }

  const byStance: StanceStats[] = STANCE_BUCKETS.map(bucket => {
    const bucketSources = grouped.get(bucket)!;
    return {
      bucket,
      total: bucketSources.length,
      reliability: summarizeReliability(bucketSources, options),
      credibility: summarizeCredibility(bucketSources, options),
    };
  });

  return {
    totalSources: independent.length,
    unassigned: grouped.get('none')!.length,
    byStance,
    overall: {
      reliability: summarizeReliability(independent, options),
      credibility: summarizeCredibility(independent, options),
    },
  };
}

/** Formats an average for display, e.g. `1.4`. */
export function formatAverage(average: number | null): string {
  if (average === null) return '—';
  return average.toFixed(1);
}

/**
 * Describes how much better one stance's average is than another's.
 * Returns null when either side has no data.
 */
export function compareAverages(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return b - a;
}
