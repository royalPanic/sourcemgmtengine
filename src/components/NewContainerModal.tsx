import { useState } from 'react';
import { TimeInput } from './TimeInput';

interface NewContainerModalProps {
  onClose: () => void;
  onSubmit: (params: {
    title: string;
    description?: string;
    eventDate?: string;
    eventTime?: string;
  }) => Promise<void>;
}

export function NewContainerModal({ onClose, onSubmit }: NewContainerModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [timeValid, setTimeValid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        eventDate: eventDate || undefined,
        eventTime: eventTime || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 card p-6">
        <h2 className="text-xl font-semibold mb-1">Create New Case</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Cases are containers for sources and notes. Optionally add a date and time.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Enter case title"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="input"
              />
              <p className="text-[11px] text-zinc-500 mt-1">Optional — leave blank if unknown</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time</label>
              <TimeInput
                date={eventDate}
                time={eventTime}
                onChange={setEventTime}
                onValidityChange={setTimeValid}
                disabled={!eventDate}
                ariaLabel="Case time (24-hour, local)"
              />
              {!eventTime && <p className="text-[11px] text-zinc-500 mt-1">Optional</p>}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea min-h-[80px]"
              placeholder="Optional description"
              rows={3}
            />
          </div>

          {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim() || !timeValid}>
              {submitting ? 'Creating…' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}