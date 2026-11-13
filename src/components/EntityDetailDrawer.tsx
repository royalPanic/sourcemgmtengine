import { useEffect, useState } from 'react';
import type { Case, Entity, EntityQualityWithRefs, QualityType } from '../types';
import { formatQualityValue } from '../types';
import { EntityQualityEditor } from './EntityQualityEditor';

interface EntityDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entity: Entity | null;
  qualities: EntityQualityWithRefs[];
  sources: { id: string; title: string }[];
  /** Every container, so a case-specific entity can be reassigned. */
  cases: Case[];
  onUpdateEntity: (id: string, params: Partial<{
    name: string;
    description: string;
    caseId: string | undefined;
    isGlobal: boolean;
  }>) => Promise<void>;
  onDeleteEntity: (id: string) => Promise<void>;
  onCreateQuality: (params: {
    entityId: string;
    qualityName: string;
    qualityType: string;
    valueString?: string | null;
    valueInteger?: number | null;
    valueBoolean?: boolean | null;
    valueDate?: string | null;
    valueCoordinates?: string | null;
    valueAddress?: string | null;
  }) => Promise<void>;
  onUpdateQuality: (id: string, params: Partial<{
    qualityName: string;
    qualityType: string;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => Promise<void>;
  onDeleteQuality: (id: string) => Promise<void>;
  onAddQualitySourceRef: (params: {
    qualityId: string;
    sourceId: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => Promise<void>;
  onRemoveQualitySourceRef: (refId: string) => Promise<void>;
}

export function EntityDetailDrawer({
  isOpen,
  onClose,
  entity,
  qualities,
  sources,
  cases,
  onUpdateEntity,
  onDeleteEntity,
  onCreateQuality,
  onUpdateQuality,
  onDeleteQuality,
  onAddQualitySourceRef,
  onRemoveQualitySourceRef,
}: EntityDetailDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entity?.name ?? '');
  const [description, setDescription] = useState(entity?.description ?? '');
  const [isGlobal, setIsGlobal] = useState(entity?.is_global ?? true);
  const [targetCaseId, setTargetCaseId] = useState<string | null>(entity?.case_id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingQualityId, setEditingQualityId] = useState<string | null>(null);
  // A blank draft for a new quality. `id: ''` marks it as unsaved.
  const [draftQuality, setDraftQuality] = useState<EntityQualityWithRefs | null>(null);

  useEffect(() => {
    if (entity) {
      setName(entity.name);
      setDescription(entity.description ?? '');
      setIsGlobal(entity.is_global);
      setTargetCaseId(entity.case_id ?? null);
    }
  }, [entity]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onUpdateEntity(entity!.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        // An empty string clears the column, so a global entity drops its case.
        caseId: isGlobal ? '' : targetCaseId ?? '',
        isGlobal,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuality = async (params: {
    qualityName: string;
    qualityType: string;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }) => {
    await onCreateQuality({
      entityId: entity!.id,
      qualityName: params.qualityName,
      qualityType: params.qualityType as QualityType,
      valueString: params.valueString ?? undefined,
      valueInteger: params.valueInteger ?? undefined,
      valueBoolean: params.valueBoolean ?? undefined,
      valueDate: params.valueDate ?? undefined,
      valueCoordinates: params.valueCoordinates ?? undefined,
      valueAddress: params.valueAddress ?? undefined,
    });
    setEditingQualityId(null);
    setDraftQuality(null);
  };

  const handleUpdateQuality = async (id: string, params: Partial<{
    qualityName: string;
    qualityType: string;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => {
    await onUpdateQuality(id, params);
    setEditingQualityId(null);
    setDraftQuality(null);
  };

  const handleDeleteQuality = async (id: string) => {
    if (!window.confirm('Delete this quality?')) return;
    setError(null);
    try {
      await onDeleteQuality(id);
      // The open editor points at the row that just disappeared.
      if (editingQualityId === id) {
        setEditingQualityId(null);
        setDraftQuality(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteEntity = async (id: string) => {
    if (!window.confirm('Delete this entity? Its qualities and provenance links are removed too.')) {
      return;
    }
    setError(null);
    try {
      await onDeleteEntity(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isOpen || !entity) return null;

  // Resolve from the live `qualities` prop rather than a snapshot, so the
  // provenance list updates as sources are added or removed. An empty id means
  // the unsaved draft is open.
  const editingQuality = editingQualityId === null
    ? null
    : editingQualityId === ''
      ? draftQuality
      : qualities.find(q => q.id === editingQualityId) ?? null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative w-full max-w-2xl h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Entity Details</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" title="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            {editing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                autoFocus
              />
            ) : (
              <div className="text-zinc-100 font-medium">{name}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <div className="text-zinc-400 text-xs">{entity.entity_type}</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            {editing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="textarea"
                rows={3}
              />
            ) : (
              <p className={description ? 'text-zinc-300' : 'text-zinc-500 italic'}>
                {description || 'No description'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Global entity</span>
            {editing ? (
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className="accent-amber-500"
              />
            ) : (
              <span className={isGlobal ? 'text-zinc-300' : 'text-zinc-500'}>
                {isGlobal ? 'Yes' : 'No'}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Container</label>
            {editing && !isGlobal ? (
              <>
                <select
                  value={targetCaseId ?? ''}
                  onChange={(e) => setTargetCaseId(e.target.value || null)}
                  className="select"
                >
                  <option value="">Select a case…</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                {cases.length === 0 && (
                  <p className="text-[10px] text-amber-500/80 mt-1">
                    Create a case first, or mark this entity global.
                  </p>
                )}
              </>
            ) : (
              <div className="text-zinc-400 text-xs">
                {isGlobal
                  ? 'Available in every case'
                  : cases.find(c => c.id === targetCaseId)?.title
                    ?? (targetCaseId ? `Case ID: ${targetCaseId}` : 'No container')}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200">Qualities</h3>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  setEditingQualityId('');
                  setDraftQuality({
                    id: '', entity_id: entity!.id, quality_name: '', quality_type: 'string',
                    value_string: null, value_integer: null, value_boolean: null,
                    value_date: null, value_coordinates: null, value_address: null,
                    created_at: '', updated_at: '', source_refs: [],
                  });
                }}
              >
                Add Quality
              </button>
            </div>

            {qualities.length === 0 && (
              <p className="text-xs text-zinc-500">No qualities yet. Add one to describe this entity.</p>
            )}

            {qualities.map(q => (
              <div key={q.id} className="border border-zinc-800 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-zinc-100">{q.quality_name}</div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn-ghost p-1 text-xs text-zinc-400 hover:text-zinc-200"
                      onClick={() => setEditingQualityId(q.id)}
                      title="Edit quality"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-1 text-xs text-red-400 hover:text-red-300"
                      onClick={() => void handleDeleteQuality(q.id)}
                      title="Delete quality"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mb-1">{q.quality_type}</div>
                <div className="text-sm text-zinc-300 mb-2">
                  {formatQualityValue(q)}
                </div>
                {q.source_refs.length > 0 ? (
                  <div className="flex gap-1 mb-2">
                    {q.source_refs.map(ref => (
                      <span
                        key={ref.id}
                        className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      >
                        {ref.source_title} ({ref.reliability_code ?? '—'}/{ref.credibility_code ?? '—'})
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-500 italic mb-2">Provenance not recorded</div>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-zinc-800">
          <div className="flex gap-3">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary" disabled={saving}>
                  Cancel
                </button>
                <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || !name.trim() || (!isGlobal && !targetCaseId)}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className="btn-secondary">
                  Close
                </button>
                <button type="button" onClick={() => setEditing(true)} className="btn-secondary">
                  Edit
                </button>
                <button type="button" onClick={() => void handleDeleteEntity(entity.id)} className="btn-ghost text-red-400 hover:text-red-300">
                  Delete
                </button>
              </>
            )}
          </div>
        </footer>
      </aside>

      {editingQuality && (
        <EntityQualityEditor
          quality={editingQuality}
          sources={sources}
          onSave={async (params) => {
            if (editingQuality.id) {
              await handleUpdateQuality(editingQuality.id, params);
            } else {
              await handleCreateQuality(params);
            }
          }}
          onAddSourceRef={async (params) => {
            await onAddQualitySourceRef({ qualityId: editingQuality.id, ...params });
          }}
          onRemoveSourceRef={async (refId) => {
            await onRemoveQualitySourceRef(refId);
          }}
          onClose={() => {
            setEditingQualityId(null);
            setDraftQuality(null);
          }}
        />
      )}
    </div>
  );
}