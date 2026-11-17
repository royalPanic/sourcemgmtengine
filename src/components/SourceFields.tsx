import type { Entity, SourceWithAttachments } from '../types';
import {
  CREDIBILITY_CODES,
  CREDIBILITY_DEFINITIONS,
  RELIABILITY_CODES,
  RELIABILITY_DEFINITIONS,
  SOURCE_TYPES,
  STANCES,
  STANCE_DEFINITIONS,
  STANCE_NONE_LABEL,
} from '../types';
import { SourceDateTimeFields } from './SourceDateTimeFields';
import { ReferenceSelect } from './ReferenceSelect';
import type { SourceFormState } from './useSourceForm';

interface SourceFieldsProps {
  form: SourceFormState;
  siblings: SourceWithAttachments[];
  entities: Entity[];
  /** Disables the controls, e.g. while a save is in flight. */
  disabled?: boolean;
  /** Heading for the provenance section; omitted hides the heading. */
  provenanceTitle?: string;
}

/**
 * The shared source form body.
 *
 * Both the "Add Source" modal and the detail drawer render these fields, so the
 * markup and the reference/rating/stance rules live in one place. The caller
 * owns the surrounding card, submit button, and error display.
 */
export function SourceFields({
  form,
  siblings,
  entities,
  disabled = false,
  provenanceTitle = 'Provenance',
}: SourceFieldsProps) {
  return (
    <>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
          className="input"
          placeholder="Source title"
          disabled={disabled}
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={form.sourceType}
          onChange={(e) => form.setSourceType(e.target.value as typeof form.sourceType)}
          className="select"
          disabled={disabled}
        >
          {SOURCE_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">URL</label>
        <input
          type="url"
          value={form.url}
          onChange={(e) => form.setUrl(e.target.value)}
          className="input"
          placeholder="https://…"
          disabled={disabled}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Raw Text</label>
        <textarea
          value={form.rawText}
          onChange={(e) => form.setRawText(e.target.value)}
          className="textarea"
          placeholder="Captured source content"
          rows={3}
          disabled={disabled}
        />
      </div>

      <div className="mb-4">
        <SourceDateTimeFields
          date={form.sourceDate}
          time={form.sourceTime}
          onChange={({ date, time }) => {
            form.setSourceDate(date);
            form.setSourceTime(time);
          }}
          onValidityChange={form.setTimeValid}
        />
      </div>

      <section className="card p-4 mb-4">
        {provenanceTitle && (
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">{provenanceTitle}</h3>
        )}
        <ReferenceSelect
          value={form.reference}
          siblings={siblings}
          entities={entities}
          disabled={disabled}
          onChange={form.setReference}
        />
      </section>

      <section className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">NATO Admiralty Rating</h3>

        <div className="mb-4">
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Source Reliability (A–F)
          </label>
          <select
            value={form.reliabilityCode}
            onChange={(e) => form.setReliabilityCode(e.target.value)}
            className="select"
            disabled={disabled}
          >
            <option value="">Not rated</option>
            {RELIABILITY_CODES.map(code => (
              <option key={code} value={code} title={RELIABILITY_DEFINITIONS[code].description}>
                {RELIABILITY_DEFINITIONS[code].label}
              </option>
            ))}
          </select>
          {form.reliabilityCode && (
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              {RELIABILITY_DEFINITIONS[form.reliabilityCode as keyof typeof RELIABILITY_DEFINITIONS].description}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="source-credibility"
            className="block text-xs font-medium text-zinc-400 mb-1"
          >
            Information Credibility (1–6)
          </label>
          <select
            id="source-credibility"
            value={form.credibilityCode}
            onChange={(e) => form.setCredibilityCode(e.target.value)}
            className="select"
            disabled={disabled}
          >
            <option value="">Not rated</option>
            {CREDIBILITY_CODES.map(code => (
              <option key={code} value={code} title={CREDIBILITY_DEFINITIONS[code].description}>
                {CREDIBILITY_DEFINITIONS[code].label}
              </option>
            ))}
          </select>
          {form.credibilityCode && (
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              {CREDIBILITY_DEFINITIONS[Number(form.credibilityCode) as keyof typeof CREDIBILITY_DEFINITIONS].description}
            </p>
          )}
        </div>
      </section>

      <section className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Stance</h3>
        <select
          value={form.stanceLocked ? '' : form.stance}
          onChange={(e) => form.setStance(e.target.value)}
          className="select"
          disabled={disabled || form.stanceLocked}
          title={
            form.stanceLocked
              ? 'A source that duplicates another capture carries no stance'
              : undefined
          }
        >
          <option value="">{STANCE_NONE_LABEL}</option>
          {STANCES.map(value => (
            <option key={value} value={value} title={STANCE_DEFINITIONS[value].description}>
              {STANCE_DEFINITIONS[value].label}
            </option>
          ))}
        </select>
        {form.stanceLocked ? (
          <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
            Locked to none while this source references another capture. A duplicate must not
            count as independent corroboration.
          </p>
        ) : form.stance ? (
          <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
            {STANCE_DEFINITIONS[form.stance as keyof typeof STANCE_DEFINITIONS].description}
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
            No stance recorded. Use this when the source does not bear on the event.
          </p>
        )}
      </section>
    </>
  );
}