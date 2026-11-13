import { useState } from 'react';
import type { Case, Entity, EntityType } from '../types';
import { EntityTypeSelector } from './EntityTypeSelector';
import { EntityTypeDesigner } from './EntityTypeDesigner';

interface EntitiesPanelProps {
  /** The currently selected case/event, used to default the entity's scope. */
  selectedCaseId: string | null;
  /** Every container, so a case-specific entity can be attached explicitly. */
  cases: Case[];
  entities: Entity[];
  entityTypes: EntityType[];
  loading: boolean;
  onCreateEntity: (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }) => Promise<void>;
  onDeleteEntity: (id: string) => Promise<void>;
  onOpenEntityDetail: (entity: Entity) => void;
}

export function EntitiesPanel({
  selectedCaseId,
  cases,
  entities,
  entityTypes,
  loading,
  onCreateEntity,
  onDeleteEntity,
  onOpenEntityDetail,
}: EntitiesPanelProps) {
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [showNewEntity, setShowNewEntity] = useState(false);
  const [manageTypes, setManageTypes] = useState(false);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [entityName, setEntityName] = useState('');
  const [entityDescription, setEntityDescription] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  // The container a case-specific entity belongs to. Defaults to the selected
  // case but is editable, so an entity can be filed against any case.
  const [targetCaseId, setTargetCaseId] = useState<string | null>(selectedCaseId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const globalEntities = entities.filter(e => e.is_global);
  const caseEntities = entities.filter(e => !e.is_global);

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onCreateEntity({
        entityType: entityType!,
        name: entityName.trim(),
        description: entityDescription.trim() || undefined,
        caseId: isGlobal ? undefined : targetCaseId ?? undefined,
        isGlobal,
      });
      setShowNewEntity(false);
      setEntityType(null);
      setEntityName('');
      setEntityDescription('');
      setIsGlobal(true);
      setTargetCaseId(selectedCaseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** Opens the New Entity dialog, defaulting the scope picker to the case. */
  const openNewEntity = () => {
    setTargetCaseId(selectedCaseId);
    setShowNewEntity(true);
  };

  const handleDeleteEntity = async (id: string) => {
    if (window.confirm(`Delete entity "${entities.find(e => e.id === id)?.name ?? id}"? This will also delete all its qualities.`)) {
      await onDeleteEntity(id);
      if (selectedEntity?.id === id) {
        setSelectedEntity(null);
      }
    }
  };

  if (manageTypes) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setManageTypes(false)}
            className="btn-ghost p-1.5 text-zinc-400 hover:text-zinc-200"
            title="Back to entities"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-medium text-zinc-300">Manage Entity Types</h2>
        </div>
        <EntityTypeDesigner
          types={entityTypes}
          onClose={() => setManageTypes(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-medium text-zinc-300">Entities ({entities.length})</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Typed objects with qualities and source provenance. Global entities appear in every container.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => setManageTypes(true)}
            title="Manage entity type templates"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Types
          </button>
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={openNewEntity}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Entity
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-zinc-800">
        <input
          type="text"
          className="input"
          placeholder="Search entities…"
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
        ) : entities.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <svg className="mx-auto h-12 w-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <p className="text-sm">No entities yet</p>
            <p className="text-xs mt-1">Create an entity to start tracking people, organizations, vehicles, and more</p>
          </div>
        ) : (
          <div className="space-y-1">
            {globalEntities.length > 0 && (
              <section>
                <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Global ({globalEntities.length})
                </h2>
                <ul className="space-y-1">
                  {globalEntities.map(entity => (
                    <li key={entity.id}>
                      <EntityListItem
                        entity={entity}
                        isSelected={selectedEntity?.id === entity.id}
                        onSelect={() => {
                          setSelectedEntity(entity);
                          onOpenEntityDetail(entity);
                        }}
                        onDelete={() => handleDeleteEntity(entity.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {caseEntities.length > 0 && (
              <section>
                <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Case-Specific ({caseEntities.length})
                </h2>
                <ul className="space-y-1">
                  {caseEntities.map(entity => (
                    <li key={entity.id}>
                      <EntityListItem
                        entity={entity}
                        isSelected={selectedEntity?.id === entity.id}
                        onSelect={() => {
                          setSelectedEntity(entity);
                          onOpenEntityDetail(entity);
                        }}
                        onDelete={() => handleDeleteEntity(entity.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {showNewEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md mx-4 card p-6">
            <h2 className="text-xl font-semibold mb-1">New Entity</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Global entities are available in every case. Case-specific entities belong to one container.
            </p>
            <form onSubmit={handleCreateEntity}>
              <EntityTypeSelector
                types={entityTypes}
                value={entityType}
                onChange={setEntityType}
              />
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="input"
                  placeholder="e.g. John Smith, Reuters, Toyota Camry"
                  autoFocus
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={entityDescription}
                  onChange={(e) => setEntityDescription(e.target.value)}
                  className="textarea"
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Scope</label>
                <select
                  value={isGlobal ? 'global' : 'case'}
                  onChange={(e) => setIsGlobal(e.target.value === 'global')}
                  className="select"
                >
                  <option value="global">Global (available in every case)</option>
                  <option value="case">Case-specific (belongs to one container)</option>
                </select>
              </div>
              {!isGlobal && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Case *</label>
                  <select
                    value={targetCaseId ?? ''}
                    onChange={(e) => setTargetCaseId(e.target.value || null)}
                    className="select"
                    required
                  >
                    <option value="">Select a case…</option>
                    {cases.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                  {cases.length === 0 && (
                    <p className="text-[10px] text-amber-500/80 mt-1">
                      Create a case first, or make this entity global.
                    </p>
                  )}
                </div>
              )}
              {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowNewEntity(false)} className="btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting || !entityType || !entityName.trim() || (!isGlobal && !targetCaseId)}>
                  {submitting ? 'Creating…' : 'Create Entity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface EntityListItemProps {
  entity: Entity;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function EntityListItem({ entity, isSelected, onSelect, onDelete }: EntityListItemProps) {
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
                {entity.name}
              </h3>
              <span
                className={`text-[10px] px-1.5 rounded ${isSelected ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}
              >
                {entity.is_global ? 'Global' : 'Case'}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1 truncate max-w-xs">
              {entity.entity_type}
            </div>
            {entity.description && (
              <p className={`text-xs mt-1 truncate ${isSelected ? 'text-amber-400/80' : 'text-zinc-500'}`}>
                {entity.description}
              </p>
            )}
          </div>
          {hovered && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete entity"
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