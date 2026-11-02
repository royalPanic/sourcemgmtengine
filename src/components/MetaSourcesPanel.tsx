import { useState } from 'react';
import type { MetaSource, MetaSourceKind, MetaSourceSummary } from '../types';
import { CREDIBILITY_DEFINITIONS, RELIABILITY_DEFINITIONS } from '../types';
import { MetaSourceModal } from './MetaSourceModal';
import { META_KIND_LABELS } from './ReferenceSelect';

interface MetaSourcesPanelProps {
  metaSources: MetaSourceSummary[];
  loading: boolean;
  onCreate: (params: {
    name: string;
    kind?: MetaSourceKind;
    description?: string;
    url?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => Promise<unknown>;
  onUpdate: (id: string, params: Partial<{
    name: string;
    kind: MetaSourceKind;
    description: string;
    url: string;
    reliabilityCode: string;
    credibilityCode: number;
  }>) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Manager for the global meta source list.
 *
 * Kept separate from the per-case source grid because these entities are not
 * owned by any case: editing one here re-rates every citation across the whole
 * workspace.
 */
export function MetaSourcesPanel({
  metaSources,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: MetaSourcesPanelProps) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MetaSource | null>(null);
  const [search, setSearch] = useState('');

  const filtered = metaSources.filter(meta => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      meta.name.toLowerCase().includes(query) ||
      meta.description?.toLowerCase().includes(query)
    );
  });

  const handleDelete = (meta: MetaSourceSummary) => {
    const warning = meta.citation_count > 0
      ? `"${meta.name}" is referenced by ${meta.citation_count} source${meta.citation_count === 1 ? '' : 's'}. ` +
        'Those sources keep the rating they inherited, but lose the link. Delete it?'
      : `Delete meta source "${meta.name}"?`;
    if (window.confirm(warning)) {
      void onDelete(meta.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-medium text-zinc-300">
            Meta Sources ({metaSources.length})
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            People and organisations that persist across every case. Their rating is inherited by
            sources that reference them.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => setCreating(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Meta Source
        </button>
      </div>

      <div className="px-4 py-3 border-b border-zinc-800">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          placeholder="Search meta sources…"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <svg className="mx-auto h-12 w-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-3-3" />
            </svg>
            <p className="text-sm">
              {metaSources.length === 0 ? 'No meta sources yet' : 'Nothing matched'}
            </p>
            <p className="text-xs mt-1">
              {metaSources.length === 0
                ? 'Add a news agency, official, or organisation to reference across cases'
                : 'Try a different search term'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Admiralty</th>
                <th className="px-4 py-2 font-medium">Citations</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(meta => (
                <tr key={meta.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-100">{meta.name}</div>
                    {meta.description && (
                      <div className="text-xs text-zinc-500 truncate max-w-sm">{meta.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{META_KIND_LABELS[meta.kind]}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {meta.reliability_code ? (
                        <span
                          className={`badge-reliability-${meta.reliability_code.toLowerCase()}`}
                          title={RELIABILITY_DEFINITIONS[meta.reliability_code].description}
                        >
                          {meta.reliability_code}
                        </span>
                      ) : (
                        <span className="text-zinc-600">–</span>
                      )}
                      {meta.credibility_code ? (
                        <span
                          className={`badge-credibility-${meta.credibility_code}`}
                          title={CREDIBILITY_DEFINITIONS[meta.credibility_code].description}
                        >
                          {meta.credibility_code}
                        </span>
                      ) : (
                        <span className="text-zinc-600">–</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{meta.citation_count}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn-ghost p-1.5"
                      title="Edit meta source"
                      onClick={() => setEditing(meta)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20"
                      title="Delete meta source"
                      onClick={() => handleDelete(meta)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <MetaSourceModal
          metaSource={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (params) => {
            if (editing) {
              await onUpdate(editing.id, {
                name: params.name,
                kind: params.kind,
                description: params.description ?? '',
                url: params.url ?? '',
                reliabilityCode: params.reliabilityCode ?? '',
                credibilityCode: params.credibilityCode ?? 0,
              });
            } else {
              await onCreate(params);
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
