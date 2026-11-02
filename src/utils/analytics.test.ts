import { describe, it, expect } from 'vitest';
import {
  computeEventAnalytics,
  scoreToReliabilityLabel,
  scoreToCredibilityLabel,
  formatAverage,
  isReferenceLinked,
  RELIABILITY_SCORES,
  CREDIBILITY_SCORES,
} from './analytics';
import type { SourceWithAttachments, Stance, ReliabilityCode, CredibilityCode } from '../types';

function source(
  stance: Stance | null,
  reliability: ReliabilityCode | null,
  credibility: CredibilityCode | null
): SourceWithAttachments {
  return {
    id: Math.random().toString(36),
    case_id: 'case-1',
    title: 'test',
    source_type: 'URL',
    url: null,
    raw_text: null,
    reliability_code: reliability,
    credibility_code: credibility,
    stance,
    reference_source_id: null,
    reference_meta_source_id: null,
    source_date: null,
    source_time: null,
    custom_metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    attachments: [],
    reference: null,
  };
}

const opts = { excludeUnjudgeable: false };
const optsExcluding = { excludeUnjudgeable: true };

describe('score maps', () => {
  it('maps reliability A..F to 1..6 with lower being better', () => {
    expect(RELIABILITY_SCORES.A).toBe(1);
    expect(RELIABILITY_SCORES.F).toBe(6);
  });

  it('maps credibility 1..6 to itself', () => {
    expect(CREDIBILITY_SCORES[1]).toBe(1);
    expect(CREDIBILITY_SCORES[6]).toBe(6);
  });
});

describe('label rounding', () => {
  it('rounds reliability averages to the nearest letter', () => {
    expect(scoreToReliabilityLabel(1.0)).toBe('A');
    expect(scoreToReliabilityLabel(1.4)).toBe('A');
    expect(scoreToReliabilityLabel(1.5)).toBe('B');
    expect(scoreToReliabilityLabel(6.0)).toBe('F');
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToReliabilityLabel(0)).toBe('A');
    expect(scoreToReliabilityLabel(99)).toBe('F');
    expect(scoreToCredibilityLabel(0)).toBe(1);
    expect(scoreToCredibilityLabel(99)).toBe(6);
  });
});

describe('computeEventAnalytics', () => {
  it('averages reliability per stance', () => {
    const sources = [
      source('supports', 'A', 1),
      source('supports', 'B', 2),
      source('refutes', 'D', 4),
      source('refutes', 'E', 5),
    ];

    const result = computeEventAnalytics(sources, opts);
    const supports = result.byStance.find(s => s.bucket === 'supports')!;
    const refutes = result.byStance.find(s => s.bucket === 'refutes')!;

    expect(supports.reliability.average).toBe(1.5);
    expect(refutes.reliability.average).toBe(4.5);
    // Supporting sources are more reliable (lower score).
    expect(supports.reliability.average!).toBeLessThan(refutes.reliability.average!);
  });

  it('buckets sources with no stance as none', () => {
    const sources = [source(null, 'A', 1), source('supports', 'B', 2)];
    const result = computeEventAnalytics(sources, opts);

    expect(result.totalSources).toBe(2);
    expect(result.unassigned).toBe(1);
    expect(result.byStance.find(s => s.bucket === 'none')!.total).toBe(1);
  });

  it('ignores sources missing a rating for that dimension', () => {
    const sources = [
      source('supports', 'A', null),
      source('supports', null, 2),
      source('supports', 'C', 4),
    ];
    const result = computeEventAnalytics(sources, opts);
    const supports = result.byStance.find(s => s.bucket === 'supports')!;

    // Reliability: A(1) and C(3) -> 2.0, the null is skipped.
    expect(supports.reliability.rated).toBe(2);
    expect(supports.reliability.average).toBe(2);
    // Credibility: 2 and 4 -> 3.0
    expect(supports.credibility.rated).toBe(2);
    expect(supports.credibility.average).toBe(3);
  });

  it('returns null averages when nothing is rated', () => {
    const result = computeEventAnalytics([source('neutral', null, null)], opts);
    const neutral = result.byStance.find(s => s.bucket === 'neutral')!;

    expect(neutral.reliability.average).toBeNull();
    expect(neutral.reliability.label).toBeNull();
    expect(neutral.credibility.average).toBeNull();
  });

  it('excludes F and 6 when asked', () => {
    const sources = [
      source('supports', 'A', 1),
      source('supports', 'F', 6),
    ];

    const withAll = computeEventAnalytics(sources, opts);
    const supportsAll = withAll.byStance.find(s => s.bucket === 'supports')!;
    // (1 + 6) / 2 = 3.5
    expect(supportsAll.reliability.average).toBe(3.5);
    expect(supportsAll.reliability.excluded).toBe(0);

    const filtered = computeEventAnalytics(sources, optsExcluding);
    const supportsFiltered = filtered.byStance.find(s => s.bucket === 'supports')!;
    // Only A remains -> 1.0
    expect(supportsFiltered.reliability.average).toBe(1);
    expect(supportsFiltered.reliability.excluded).toBe(1);
    expect(supportsFiltered.credibility.average).toBe(1);
    expect(supportsFiltered.credibility.excluded).toBe(1);
  });

  it('filters each dimension independently', () => {
    // F reliability but credible (2): only the reliability side is dropped.
    const sources = [source('supports', 'F', 2), source('supports', 'B', 4)];
    const result = computeEventAnalytics(sources, optsExcluding);
    const supports = result.byStance.find(s => s.bucket === 'supports')!;

    expect(supports.reliability.rated).toBe(1);
    expect(supports.reliability.average).toBe(2); // only B
    expect(supports.credibility.rated).toBe(2);
    expect(supports.credibility.average).toBe(3); // (2 + 4) / 2
  });

  it('computes an overall average across all stances', () => {
    const sources = [
      source('supports', 'A', 1),
      source('refutes', 'C', 3),
      source(null, 'E', 5),
    ];
    const result = computeEventAnalytics(sources, opts);

    expect(result.overall.reliability.average).toBe(3); // (1+3+5)/3
    expect(result.overall.credibility.average).toBe(3);
  });

  it('handles an empty source list', () => {
    const result = computeEventAnalytics([], opts);
    expect(result.totalSources).toBe(0);
    expect(result.overall.reliability.average).toBeNull();
    expect(result.byStance).toHaveLength(4);
  });
});

describe('reference-linked sources', () => {
  function citing(overrides: Partial<SourceWithAttachments>): SourceWithAttachments {
    return { ...source('supports', 'A', 1), ...overrides };
  }

  it('are excluded from every dashboard statistic', () => {
    // One core source plus five outlets echoing it. Counting the echoes would
    // turn a single corroboration into six.
    const sources = [
      source('supports', 'A', 1),
      ...Array.from({ length: 5 }, () =>
        citing({ reference_meta_source_id: 'meta-1', stance: null })
      ),
    ];

    const result = computeEventAnalytics(sources, opts);

    expect(result.totalSources).toBe(1);
    expect(result.overall.reliability.rated).toBe(1);
    expect(result.byStance.find(s => s.bucket === 'supports')?.total).toBe(1);
    expect(result.unassigned).toBe(0);
  });

  it('are excluded whether they cite a source or a meta source', () => {
    const sources = [
      source('refutes', 'B', 2),
      citing({ reference_source_id: 'source-1', stance: null }),
      citing({ reference_meta_source_id: 'meta-1', stance: null }),
    ];

    expect(computeEventAnalytics(sources, opts).totalSources).toBe(1);
  });

  it('do not inflate the unassigned bucket', () => {
    // A citing source has no stance by design; that is not the same as a
    // source the analyst forgot to classify.
    const sources = [source(null, 'C', 3), citing({ reference_meta_source_id: 'meta-1' })];
    expect(computeEventAnalytics(sources, opts).unassigned).toBe(1);
  });

  it('are detected by either reference column', () => {
    expect(isReferenceLinked(source(null, null, null))).toBe(false);
    expect(isReferenceLinked(citing({ reference_source_id: 'a' }))).toBe(true);
    expect(isReferenceLinked(citing({ reference_meta_source_id: 'b' }))).toBe(true);
  });
});

describe('formatAverage', () => {
  it('formats to one decimal place', () => {
    expect(formatAverage(1)).toBe('1.0');
    expect(formatAverage(2.25)).toBe('2.3');
    expect(formatAverage(null)).toBe('—');
  });
});
