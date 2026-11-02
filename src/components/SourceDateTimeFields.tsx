import { TimeInput } from './TimeInput';

interface SourceDateTimeFieldsProps {
  date: string;
  time: string;
  onChange: (next: { date: string; time: string }) => void;
  /** Reports whether the time text is currently usable. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Optional date/time pair for a source. The time is the user's local
 * wall-clock time in 24-hour `HH:MM`; `TimeInput` shows the UTC equivalent.
 */
export function SourceDateTimeFields({
  date,
  time,
  onChange,
  onValidityChange,
}: SourceDateTimeFieldsProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Source Date &amp; Time</label>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            const nextDate = e.target.value;
            // A time without a date is meaningless, so clearing the date
            // clears the time with it.
            onChange({ date: nextDate, time: nextDate ? time : '' });
          }}
          className="input"
          aria-label="Source date"
        />
        <TimeInput
          date={date}
          time={time}
          onChange={(nextTime) => onChange({ date, time: nextTime })}
          onValidityChange={onValidityChange}
          disabled={!date}
          ariaLabel="Source time (24-hour, local)"
        />
      </div>
      {!time && (
        <p className="mt-1 text-[11px] text-zinc-500">
          Optional. When the source itself is dated — a report, post, or capture time.
        </p>
      )}
    </div>
  );
}


