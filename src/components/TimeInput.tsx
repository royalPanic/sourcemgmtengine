import { useEffect, useRef, useState } from 'react';
import { formatUtc, isValidTime, normalizeTimeInput } from '../utils/datetime';

interface TimeInputProps {
  /** `YYYY-MM-DD` the time belongs to; the UTC hint needs it. */
  date: string;
  /** `HH:MM`, 24-hour local time. */
  time: string;
  onChange: (time: string) => void;
  /** Reports whether the text currently in the field is a usable time. */
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * 24-hour local time input.
 *
 * The value is stored exactly as typed (`HH:MM`, no timezone) so it stays
 * readable. The UTC equivalent is shown underneath for interoperability with
 * collaborators in other timezones; it is derived, never stored.
 */
export function TimeInput({
  date,
  time,
  onChange,
  onValidityChange,
  disabled = false,
  ariaLabel = 'Time (24-hour, local)',
}: TimeInputProps) {
  // The field is free-form so `9:5` can be typed, but the committed value is
  // always normalised to `HH:MM`.
  const [text, setText] = useState(time);
  const [error, setError] = useState<string | null>(null);
  // Callers pass an inline callback, so keep the latest one in a ref rather
  // than re-running the reset effect on every render.
  const validityRef = useRef(onValidityChange);
  validityRef.current = onValidityChange;

  useEffect(() => {
    setText(time);
    setError(null);
    validityRef.current?.(true);
  }, [time]);

  const commit = (raw: string) => {
    const normalized = normalizeTimeInput(raw);
    if (normalized === null) {
      setError('Enter a 24-hour time, e.g. 19:30.');
      onValidityChange?.(false);
      return;
    }
    setError(null);
    onValidityChange?.(true);
    setText(normalized);
    onChange(normalized);
  };

  const utc = date && isValidTime(time) ? formatUtc(date, time) : null;

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
          onValidityChange?.(true);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value);
        }}
        className="input font-mono"
        placeholder="HH:MM"
        maxLength={5}
        disabled={disabled}
        spellCheck={false}
        aria-label={ariaLabel}
      />
      {error ? (
        <p className="mt-1 text-[11px] text-red-400">{error}</p>
      ) : utc ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          Local · <span className="text-zinc-400 font-mono">{utc}</span>
        </p>
      ) : null}
    </>
  );
}
