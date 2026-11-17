import { useEffect, useState } from 'react';

interface LoadErrorBannerProps {
  /** The failure to show, or null when everything loaded. */
  message: string | null;
}

/**
 * Shows a failed data load above the workspace.
 *
 * Without this, a rejected read leaves the affected view empty — which looks
 * exactly like "nothing here yet" — and the operator has no way to tell a
 * broken query from an empty case.
 *
 * Dismissal is remembered per message, so the banner stays gone until a
 * different failure appears.
 */
export function LoadErrorBanner({ message }: LoadErrorBannerProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  // A new failure is a new problem, so it must not inherit the previous
  // dismissal.
  useEffect(() => {
    setDismissed(null);
  }, [message]);

  if (!message || dismissed === message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-red-900/50 bg-red-950/40 px-4 py-2.5"
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p className="flex-1 text-xs text-red-200">{message}</p>
      <button
        type="button"
        onClick={() => setDismissed(message)}
        className="btn-ghost shrink-0 p-1 text-red-300 hover:bg-red-600/20"
        title="Dismiss"
        aria-label="Dismiss error"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}