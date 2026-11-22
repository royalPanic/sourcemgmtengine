import type { EntityType } from '../types';

interface EntityTypeSelectorProps {
  types: EntityType[];
  value: string | null;
  onChange: (typeId: string | null) => void;
  disabled?: boolean;
}

export function EntityTypeSelector({
  types,
  value,
  onChange,
  disabled = false,
}: EntityTypeSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Entity Type</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="select"
        disabled={disabled || types.length === 0}
      >
        <option value="">Select a type</option>
        {types.map(type => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
      {types.length === 0 && (
        <p className="mt-1 text-[11px] text-zinc-500">
          No entity types available. Create one in Manage Entity Types.
        </p>
      )}
    </div>
  );
}