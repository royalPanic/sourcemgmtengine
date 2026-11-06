import { useState } from 'react';
import type { EntityType, EntityTypeQuality, QualityType } from '../types';

interface EntityTypeDesignerProps {
  types: EntityType[];
  onClose: () => void;
}

export function EntityTypeDesigner({ onClose }: EntityTypeDesignerProps) {
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
  };

  const handleStartNew = () => {
    setEditingType(null);
    setNewTypeId('');
    setNewTypeName('');
    setNewTypeDescription('');
    setQualities([]);
    setNewQualityName('');
    setNewQualityType('string');
    setNewQualityRequired(false);
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
    setSubmitting(true);
    try {
      if (!newTypeId.trim() || !newTypeName.trim()) {
        setError('Type ID and name are required');
        return;
      }
      // In a full implementation this would call a backend command to persist
      // the template. For now we just validate and close.
      console.log('Saving entity type:', {
        id: newTypeId,
        name: newTypeName,
        description: newTypeDescription,
        default_qualities: qualities,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300">
          {editingType ? `Edit: ${editingType.name}` : 'New Entity Type'}
        </h2>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Define the type ID, name, description, and default qualities. Templates are stored as JSON
          files and can be exported/imported.
        </p>
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
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Machine-readable identifier used in the database and JSON template file.
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
                {QUALITY_TYPES.map(t => (
                  <option key={t} value={t}>{QUALITY_TYPE_LABELS[t]}</option>
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
          <button
            type="button"
            className="btn-secondary"
            onClick={editingType ? () => setEditingType(null) : handleStartNew}
            disabled={submitting}
          >
            {editingType ? 'Cancel Edit' : 'Cancel'}
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

const QUALITY_TYPES: QualityType[] = ['string', 'boolean', 'integer', 'date', 'coordinates', 'address'];