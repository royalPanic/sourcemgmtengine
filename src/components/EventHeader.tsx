import { useEffect, useState } from 'react';
import type { Case } from '../types';
import { formatEventDate } from './Sidebar';

interface EventHeaderProps {
  container: Case;
  onUpdate: (id: string, params: Partial<{
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
  }>) => Promise<unknown>;
}

/**
 * Editable banner for an event: title, date, and optional time. Changes are
 * committed on blur or Enter so the date stays editable without a modal.
 */
export function EventHeader({ container, onUpdate }: EventHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(container.title);
  const [date, setDate] = useState(container.event_date ?? '');
  const [time, setTime] = useState(container.event_time ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(container.title);
    setDate(container.event_date ?? '');
    setTime(container.event_time ?? '');
  }, [container]);

  const commit = async () => {
    setError(null);
    setSaving(true);
    try {
      // An empty string tells the backend to clear the stored value.
      await onUpdate(container.id, {
        title: title.trim() || container.title,
        eventDate: date,
        eventTime: time,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setTitle(container.title);
    setDate(container.event_date ?? '');
    setTime(container.event_time ?? '');
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-lg font-semibold text-zinc-100 truncate">{container.title}</h2>
            </div>
            <p className="mt-1 text-sm text-amber-400/90">
              {container.event_date
                ? formatEventDate(container.event_date, container.event_time)
                : 'No date set'}
            </p>
            {container.description && (
              <p className="mt-1 text-xs text-zinc-500">{container.description}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary text-xs shrink-0"
            onClick={() => setEditing(true)}
          >
            Edit Event
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/60">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
            <p className="text-[11px] text-zinc-500 mt-1">Optional — clear to mark as unknown</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={cancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary text-xs" onClick={() => void commit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
