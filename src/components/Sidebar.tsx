import { useState } from 'react';
import type { Case } from '../types';

interface SidebarProps {
  cases: Case[];
  loading: boolean;
  selectedCaseId: string | null;
  /** True when the entities panel is showing instead of a container. */
  entitiesActive: boolean;
  onSelectCase: (caseId: string) => void;
  onOpenEntities: () => void;
  onCreateCase: () => void;
  /** Deletes the case. The Sidebar handles user confirmation before calling this. */
  onDeleteCase: (caseId: string) => Promise<void>;
}

export function Sidebar({
  cases,
  loading,
  selectedCaseId,
  entitiesActive,
  onSelectCase,
  onOpenEntities,
  onCreateCase,
  onDeleteCase,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  /** The case pending deletion confirmation, plus its title for the prompt. */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const filteredCases = cases.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setPendingDelete(null);
    await onDeleteCase(pendingDelete.id);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-zinc-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-100">OSINT Case Manager</h1>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cases..."
            className="input pl-10"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <svg className="mx-auto h-12 w-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Nothing found</p>
            <p className="text-xs mt-1">Create a case to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            <section>
              <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Cases ({filteredCases.length})
              </h2>
              <ul className="space-y-1">
                {filteredCases.map(caseItem => (
                  <li key={caseItem.id}>
                    <CaseListItem
                      caseItem={caseItem}
                      isSelected={selectedCaseId === caseItem.id}
                      onSelect={() => onSelectCase(caseItem.id)}
                      onDelete={() => setPendingDelete({ id: caseItem.id, title: caseItem.title })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-zinc-800 space-y-2">
        <button
          onClick={onOpenEntities}
          className={`w-full justify-start ${entitiesActive ? 'btn-primary' : 'btn-secondary'}`}
          title="Manage entities — typed objects with qualities and source provenance"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Entities
        </button>
        <button onClick={onCreateCase} className="btn-primary w-full">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Case
        </button>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md mx-4 card p-6">
            <h2 className="text-lg font-semibold mb-1">
              Delete Case?
            </h2>
            <p className="text-sm text-zinc-300 mb-4">
              Are you sure you want to delete "{pendingDelete.title}"? This will also delete all associated sources and notes.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn-ghost text-red-400 hover:bg-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

interface CaseListItemProps {
  caseItem: Case;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function CaseListItem({ caseItem, isSelected, onSelect, onDelete }: CaseListItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`relative group rounded-lg transition-colors ${
        isSelected
          ? 'bg-amber-600/20 border border-amber-500/50'
          : 'hover:bg-zinc-800/50'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className={`font-medium truncate ${isSelected ? 'text-amber-300' : 'text-zinc-100'}`}>
                {caseItem.title}
              </h3>
            </div>
            {caseItem.event_date && (
              <p className={`text-xs mt-1 ${isSelected ? 'text-amber-400/80' : 'text-zinc-400'}`}>
                {formatEventDate(caseItem.event_date, caseItem.event_time)}
              </p>
            )}
            {caseItem.description && (
              <p className={`text-xs mt-1 truncate ${isSelected ? 'text-amber-400/80' : 'text-zinc-500'}`}>
                {caseItem.description}
              </p>
            )}
            <p className={`text-xs mt-2 ${isSelected ? 'text-amber-400/60' : 'text-zinc-600'}`}>
              Updated {formatDate(caseItem.updated_at)}
            </p>
          </div>
          {hovered && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete case"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-lg" />}
    </div>
  );
}

/** Renders `YYYY-MM-DD` (+ optional `HH:MM`) without timezone shifting. */
export function formatEventDate(date: string, time: string | null): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;

  const formatted = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return time ? `${formatted} · ${time}` : formatted;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}