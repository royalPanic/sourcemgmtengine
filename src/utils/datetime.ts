/**
 * Date/time helpers for user-entered local times.
 *
 * Times are stored exactly as the user typed them (`HH:MM`, no timezone) so
 * they stay readable. UTC is derived on demand for interoperability with
 * collaborators in other timezones — it is never persisted.
 */

export interface DateTimeParts {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM`, 24-hour */
  time: string;
}

const STRICT_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const COLON_TIME = /^(\d{1,2}):(\d{1,2})$/;
const COMPACT_TIME = /^(\d{2})(\d{2})$/;
const HOUR_ONLY = /^(\d{1,2})$/;

/** True when `value` is a strict 24-hour `HH:MM` time. */
export function isValidTime(value: string): boolean {
  return STRICT_TIME.test(value);
}

/**
 * Normalises loose time input to `HH:MM`.
 *
 * Accepts `9:5`, `09:05`, `0905`, and `9`. Returns `''` for empty input and
 * `null` when the text cannot be read as a time, so callers can distinguish
 * "cleared" from "invalid".
 */
export function normalizeTimeInput(raw: string): string | null {
  const text = raw.trim();
  if (text === '') return '';

  let hour: number;
  let minute: number;

  const colon = COLON_TIME.exec(text);
  const compact = COMPACT_TIME.exec(text);
  const hourOnly = HOUR_ONLY.exec(text);

  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (compact) {
    hour = Number(compact[1]);
    minute = Number(compact[2]);
  } else if (hourOnly) {
    hour = Number(hourOnly[1]);
    minute = 0;
  } else {
    return null;
  }

  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Converts a stored local date/time to UTC.
 *
 * Returns `null` when there is no time, since a bare date has no offset to
 * apply. Ambiguous or non-existent local times (DST transitions) resolve the
 * way the platform's `Date` resolves them.
 */
export function toUtc(date: string, time: string | null): DateTimeParts | null {
  if (!time) return null;

  const local = parseLocal(date, time);
  if (!local) return null;

  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

/**
 * Formats the UTC equivalent of a local date/time.
 *
 * The date is only included when the offset pushes the value across midnight,
 * so the common case stays short: `19:30 UTC` vs `2026-05-02 19:30 UTC`.
 */
export function formatUtc(date: string, time: string | null): string | null {
  const utc = toUtc(date, time);
  if (!utc) return null;
  return utc.date === date ? `${utc.time} UTC` : `${utc.date} ${utc.time} UTC`;
}

/** Builds a `Date` from local parts, or `null` when the parts are malformed. */
function parseLocal(date: string, time: string): Date | null {
  const dateParts = date.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;

  const timeParts = time.split(':').map(Number);
  if (timeParts.length !== 2 || timeParts.some(Number.isNaN)) return null;

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
