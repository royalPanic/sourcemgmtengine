import { describe, it, expect } from 'vitest';
import {
  isValidTime,
  normalizeTimeInput,
  toUtc,
  formatUtc,
} from './datetime';

describe('isValidTime', () => {
  it('accepts strict 24-hour times', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('09:05')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidTime('')).toBe(false);
    expect(isValidTime('9:05')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('12:30:00')).toBe(false);
    expect(isValidTime('12:30 PM')).toBe(false);
  });
});

describe('normalizeTimeInput', () => {
  it('pads loose input to HH:MM', () => {
    expect(normalizeTimeInput('9:5')).toBe('09:05');
    expect(normalizeTimeInput('09:05')).toBe('09:05');
    expect(normalizeTimeInput('0905')).toBe('09:05');
    expect(normalizeTimeInput('9')).toBe('09:00');
    expect(normalizeTimeInput(' 23:59 ')).toBe('23:59');
  });

  it('treats empty input as cleared', () => {
    expect(normalizeTimeInput('')).toBe('');
    expect(normalizeTimeInput('   ')).toBe('');
  });

  it('returns null for unreadable input', () => {
    expect(normalizeTimeInput('24:00')).toBeNull();
    expect(normalizeTimeInput('12:60')).toBeNull();
    expect(normalizeTimeInput('noon')).toBeNull();
    expect(normalizeTimeInput('12:30 PM')).toBeNull();
  });
});

describe('toUtc', () => {
  it('returns null without a time', () => {
    expect(toUtc('2026-05-01', null)).toBeNull();
    expect(toUtc('2026-05-01', '')).toBeNull();
  });

  it('converts local time to UTC', () => {
    // Build the expectation from the same local parts so the test is
    // timezone-agnostic.
    const local = new Date(2026, 4, 1, 19, 30);
    const expected = {
      date: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`,
      time: `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
    };
    expect(toUtc('2026-05-01', '19:30')).toEqual(expected);
  });

  it('returns null for malformed parts', () => {
    expect(toUtc('not-a-date', '19:30')).toBeNull();
    expect(toUtc('2026-05-01', 'nope')).toBeNull();
  });
});

describe('formatUtc', () => {
  it('omits the date when the offset stays within the same day', () => {
    const utc = toUtc('2026-05-01', '19:30');
    expect(utc).not.toBeNull();
    const formatted = formatUtc('2026-05-01', '19:30');
    expect(formatted).toBe(
      utc!.date === '2026-05-01' ? `${utc!.time} UTC` : `${utc!.date} ${utc!.time} UTC`
    );
  });

  it('includes the date when the offset crosses midnight', () => {
    // 00:30 local is the previous day in any timezone west of UTC.
    const utc = toUtc('2026-05-01', '00:30');
    expect(utc).not.toBeNull();
    const formatted = formatUtc('2026-05-01', '00:30');
    expect(formatted).toBe(
      utc!.date === '2026-05-01' ? `${utc!.time} UTC` : `${utc!.date} ${utc!.time} UTC`
    );
  });

  it('returns null without a time', () => {
    expect(formatUtc('2026-05-01', null)).toBeNull();
  });
});
