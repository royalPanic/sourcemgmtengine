import { useState } from 'react';
import type { EntityType, EntityTypeQuality, QualityType } from '../types';
import { confirmNative } from '../utils/dialog';

interface EntityTypeDesignerProps {
  types: EntityType[];
  onCreate: (params: {
    id: string;
    name: string;
    description?: string;
    defaultQualities: EntityTypeQuality[];
  }) => Promise<void>;
  onUpdate: (id: string, params: Partial<{
    name: string;
    description: string;
    defaultQualities: EntityTypeQuality[];
  }>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EntityTypeDesigner({
  types,
  onCreate,
  onUpdate,
  onDelete,
}: EntityTypeDesignerProps) {
  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list');
  const [editingType, setEditingType] = useState<EntityType | null>(null);
  const [newTypeId, setNewTypeId] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [qualities, setQualities] = useState<EntityTypeQuality[]>([]);
  const [newQualityName, setNewQualityName] = useState('');
  const [newQualityType, setNewQualityType] = useState<QualityType>('string');
  const [newQualityRequired, setNewQualityRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const QUALITY_TYPE_LABELS: Record<QualityType, string> = {
    string: 'String',
    boolean: 'Boolean',
    integer: 'Integer',
    date: 'Date',
    coordinates: 'Coordinates',
    address: 'Address',
    reliability: 'Reliability (A–F)',
  };

  const handleStartNew = () => {
    setMode('new');
    setEditingType(null);
    setNewTypeId('');
    setNewTypeName('');
    setNewTypeDescription('');
    setQualities([]);
    setNewQualityName('');
    setNewQualityType('string');
    setNewQualityRequired(false);
    setError(null);
  };

  const handleEditType = (type: EntityType) => {
    setMode('edit');
    setEditingType(type);
    setNewTypeId(type.id);
    setNewTypeName(type.name);
    setNewTypeDescription(type.description ?? '');
    setQualities(type.default_qualities);
    setError(null);
  };

  const handleBackToList = () => {
    setMode('list');
    setEditingType(null);
    setError(null);
  };

  const handleAddQuality = () => {
    if (!newQualityName.trim()) return;
    setQualities([...qualities, {
      name: newQualityName.trim(),
      type: newQualityType,
      required: newQualityRequired,
    }]);
    setNewQualityName('');
    setNewQualityType('string');
    setNewQualityRequired(false);
  };

  const handleRemoveQuality = (index: number) => {
    setQualities(qualities.filter((_, i) => i !== index));
  };

  const handleSaveType = async () => {
    setError(null);

    const id = newTypeId.trim();
    const name = newTypeName.trim();
    if (!id || !name) {
      setError('Type ID and name are required');
      return;
    }

    // The quality inputs are a draft until "Add Quality" is clicked. Include
    // that draft in Save as well, otherwise a fully-filled quality silently
    // disappears when the operator saves or closes the editor.
    const submittedQualities = newQualityName.trim()
      ? [
          ...qualities,
          {
            name: newQualityName.trim(),
            type: newQualityType,
            required: newQualityRequired,
          },
        ]
      : qualities;

    // A quality with no name would be invisible in the list, so refuse it here
    // rather than letting the backend reject the whole save.
    const unnamed = submittedQualities.find(q => !q.name.trim());
    if (unnamed) {
      setError('Every default quality needs a name');
      return;
    }

    setSubmitting(true);
    try {
      if (editingType) {
        await onUpdate(editingType.id, {
          name,
          description: newTypeDescription.trim(),
          defaultQualities: submittedQualities,
        });
      } else {
        await onCreate({
          id,
          name,
          description: newTypeDescription.trim() || undefined,
          defaultQualities: submittedQualities,
        });
      }
      // Back to the list so the saved template is visible.
      setMode('list');
      setEditingType(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (type: EntityType) => {
    setError(null);
    const confirmed = await confirmNative(
      `Delete the entity type "${type.name}"?`,
      'Delete Entity Type',
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await onDelete(type.id);
      // The open editor points at the row that just disappeared.
      if (editingType?.id === type.id) {
        setMode('list');
        setEditingType(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Show list view when not editing/creating
  if (mode === 'list') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] text-zinc-500">
              Entity type templates define the default qualities for entities of that type.
              Pre-seeded types ship with the app; custom types can be created here.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={handleStartNew}
              disabled={submitting}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Type
            </button>
          </div>

          {types.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <p className="text-sm">No entity types yet</p>
              <p className="text-xs mt-1">Create a type to start defining entity templates</p>
            </div>
          ) : (
            <div className="space-y-2">
              {types.map(type => (
                <div
                  key={type.id}
                  className="card p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  onClick={() => handleEditType(type)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-zinc-100 truncate">{type.name}</h3>
                      <span className="text-[10px] px-1.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {type.id}
                      </span>
                      {type.is_builtin && (
                        <span className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Built-in
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2-11-4z" />
                      </svg>
                      {!type.is_builtin && (
                        <button
                          type="button"
                          className="btn-ghost p-1.5 text-red-400 hover:bg-red-600/20"
                          title={`Delete ${type.name}`}
                          disabled={submitting}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(type);
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {type.description && (
                    <p className="text-xs text-zinc-500 mb-2">{type.description}</p>
                  )}
                  <div className="flex gap-1">
                    {type.default_qualities.map(q => (
                      <span
                        key={q.name}
                        className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      >
                        {q.name} ({q.type}){q.required ? ' • required' : ''}
                      </span>
                    ))}
                    {type.default_qualities.length === 0 && (
                      <span className="text-[10px] text-zinc-600 italic">No default qualities</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  // Edit/create form view
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800">
        <button
          type="button"
          onClick={handleBackToList}
          className="btn-ghost p-1.5 text-zinc-400 hover:text-zinc-200"
          title="Back to type list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-zinc-300">
          {editingType ? `Edit: ${editingType.name}` : 'New Entity Type'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Type Details</h3>
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Type ID *</label>
            <input
              type="text"
              value={newTypeId}
              onChange={(e) => setNewTypeId(e.target.value)}
              className="input font-mono text-xs"
              placeholder="e.g. person, organization, vehicle"
              // The id is stored on every entity of this type, so renaming it
              // would orphan them. Create-time only.
              readOnly={editingType !== null}
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              {editingType
                ? 'The type ID is fixed once entities use it.'
                : 'Machine-readable identifier used in the database and JSON template file.'}
            </p>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Name *</label>
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              className="input"
              placeholder="e.g. Person, Organization, Vehicle"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <textarea
              value={newTypeDescription}
              onChange={(e) => setNewTypeDescription(e.target.value)}
              className="textarea"
              placeholder="What kind of entity is this?"
              rows={2}
            />
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Default Qualities</h3>
          <p className="text-[11px] text-zinc-500 mb-3">
            Qualities that every entity of this type starts with. Users can add more qualities
            to individual entities at any time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Quality Name</label>
              <input
                type="text"
                value={newQualityName}
                onChange={(e) => setNewQualityName(e.target.value)}
                className="input text-xs"
                placeholder="e.g. Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Type</label>
              <select
                value={newQualityType}
                onChange={(e) => setNewQualityType(e.target.value as QualityType)}
                className="select text-xs"
              >
                {['string', 'boolean', 'integer', 'date', 'coordinates', 'address', 'reliability'].map(t => (
                  <option key={t} value={t}>{QUALITY_TYPE_LABELS[t as QualityType]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newQualityRequired}
                  onChange={(e) => setNewQualityRequired(e.target.checked)}
                  className="accent-amber-500"
                />
                Required
              </label>
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary text-xs w-full"
            onClick={handleAddQuality}
            disabled={!newQualityName.trim()}
          >
            Add Quality
          </button>

          {qualities.length > 0 && (
            <div className="mt-3 space-y-1">
              {qualities.map((q, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 border border-zinc-800 rounded bg-zinc-900/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-200">{q.name}</span>
                    <span className="text-[10px] px-1.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {q.type}
                    </span>
                    {q.required && (
                      <span className="text-[10px] px-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        Required
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-red-400 hover:text-red-300"
                    onClick={() => handleRemoveQuality(i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          {editingType && !editingType.is_builtin && (
            <button
              type="button"
              className="btn-ghost text-red-400 hover:text-red-300 mr-auto"
              onClick={() => void handleDelete(editingType)}
              disabled={submitting}
            >
              Delete Type
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleBackToList}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveType}
            disabled={submitting || !newTypeId.trim() || !newTypeName.trim()}
          >
            {submitting ? 'Saving…' : editingType ? 'Save Type' : 'Create Type'}
          </button>
        </div>
      </div>
    </div>
  );
}