import { useEffect, useRef, useState } from 'react';
import type { SourceWithAttachments, SourceType, SourceCustomMetadata, SourceAttachment, Stance } from '../types';
import {
  SOURCE_TYPES,
  RELIABILITY_CODES,
  CREDIBILITY_CODES,
  RELIABILITY_DEFINITIONS,
  CREDIBILITY_DEFINITIONS,
  STANCES,
  STANCE_DEFINITIONS,
  STANCE_NONE_LABEL,
} from '../types';
import { MediaPreview } from './MediaPreview';
import { SourceDateTimeFields } from './SourceDateTimeFields';
import { pickFile, type PickerMode } from '../utils/filePicker';
import { readLocation, isValidCoordinate, formatCoordinate, LAT_KEY, LON_KEY, LOCATION_LABEL_KEY } from '../utils/geo';
import {
  COORDINATE_FORMATS,
  FORMAT_LABELS,
  FORMAT_HINTS,
  formatCoordinateIn,
  parseCoordinateIn,
  type CoordinateFormat,
} from '../utils/coordinates';

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  source: SourceWithAttachments | null;
  isEvent: boolean;
  onUpdate: (id: string, params: Partial<{
    title: string;
    sourceType: SourceType;
    url: string;
    rawText: string;
    reliabilityCode: string;
    credibilityCode: number;
    stance: Stance;
    sourceDate: string;
    sourceTime: string;
    customMetadata: SourceCustomMetadata;
  }>) => Promise<unknown>;
  onImportAttachment: (sourceId: string, sourcePath: string) => Promise<unknown>;
  onDeleteAttachment: (sourceId: string, attachmentId: string, relativePath: string) => Promise<void>;
  onOpenAttachment: (relativePath: string) => Promise<void>;
  resolveAttachmentUrl: (relativePath: string) => Promise<string>;
}

export function DetailDrawer({
  isOpen,
  onClose,
  source,
  isEvent,
  onUpdate,
  onImportAttachment,
  onDeleteAttachment,
  onOpenAttachment,
  resolveAttachmentUrl,
}: DetailDrawerProps) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('URL');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [reliabilityCode, setReliabilityCode] = useState('');
  const [credibilityCode, setCredibilityCode] = useState('');
  const [stance, setStance] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [sourceTime, setSourceTime] = useState('');
  const [timeValid, setTimeValid] = useState(true);
  const [locationLabel, setLocationLabel] = useState('');
  const [coordFormat, setCoordFormat] = useState<CoordinateFormat>('dd');
  // Canonical decimal degrees. The text field is only a rendering of this, so
  // switching notation never accumulates rounding error.
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [coordText, setCoordText] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  // Lets the source-reset effect read the current notation without re-running
  // every time the user switches format.
  const coordFormatRef = useRef<CoordinateFormat>('dd');
  coordFormatRef.current = coordFormat;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    setTitle(source.title);
    setSourceType(source.source_type);
    setUrl(source.url ?? '');
    setRawText(source.raw_text ?? '');
    setReliabilityCode(source.reliability_code ?? '');
    setCredibilityCode(source.credibility_code ? String(source.credibility_code) : '');
    setStance(source.stance ?? '');
    setSourceDate(source.source_date ?? '');
    setSourceTime(source.source_time ?? '');

    const location = readLocation(source.custom_metadata);
    setCoord(location ? { lat: location.lat, lon: location.lon } : null);
    setCoordText(location ? safeFormat(location.lat, location.lon, coordFormatRef.current) : '');
    setCoordError(null);
    setLocationLabel(location?.label ?? '');

    setUploadError(null);
    setSaveError(null);
  }, [source]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !source) return null;

  /**
   * Switches notation and rewrites the field in place, so the value can be
   * copied straight into other mapping software.
   */
  const handleFormatChange = (next: CoordinateFormat) => {
    if (next === coordFormat) return;

    // Prefer the canonical value; fall back to whatever is typed so a
    // hand-entered coordinate still converts.
    const source = coord ?? parseCoordinateIn(coordText, coordFormat);
    setCoordFormat(next);
    setCoordError(null);

    if (!source) {
      if (coordText.trim() !== '') {
        setCoordError(`Could not read that as ${FORMAT_LABELS[coordFormat]}.`);
      }
      return;
    }
    if (!isValidCoordinate(source.lat, source.lon)) {
      setCoordError('That coordinate is out of range.');
      return;
    }

    setCoord(source);
    setCoordText(safeFormat(source.lat, source.lon, next));
  };

  const handleSave = async () => {
    setSaveError(null);

    // Location is optional, but unparseable input is a mistake worth catching.
    const hasCoord = coordText.trim() !== '';
    let customMetadata: SourceCustomMetadata | undefined;
    if (hasCoord) {
      const parsed = coord ?? parseCoordinateIn(coordText, coordFormat);
      if (!parsed) {
        setSaveError(`Could not read that as ${FORMAT_LABELS[coordFormat]}.`);
        return;
      }
      if (!isValidCoordinate(parsed.lat, parsed.lon)) {
        setSaveError('Latitude must be -90…90 and longitude -180…180.');
        return;
      }

      const existing = parseMetadata(source.custom_metadata);
      customMetadata = {
        ...existing,
        [LAT_KEY]: parsed.lat,
        [LON_KEY]: parsed.lon,
        [LOCATION_LABEL_KEY]: locationLabel.trim() || null,
      };
    } else {
      // Clearing the fields removes the location keys but keeps other metadata.
      const existing = parseMetadata(source.custom_metadata);
      if (LAT_KEY in existing || LON_KEY in existing || LOCATION_LABEL_KEY in existing) {
        const { [LAT_KEY]: _lat, [LON_KEY]: _lon, [LOCATION_LABEL_KEY]: _label, ...rest } = existing;
        customMetadata = rest;
      }
    }

    setSaving(true);
    try {
      await onUpdate(source.id, {
        title: title.trim(),
        sourceType,
        url,
        rawText,
        reliabilityCode,
        credibilityCode: credibilityCode ? Number(credibilityCode) : 0,
        stance: isEvent && stance ? (stance as Stance) : undefined,
        // Empty strings clear the stored values.
        sourceDate,
        sourceTime: sourceDate ? sourceTime : '',
        customMetadata,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = async (mode: PickerMode) => {
    setUploadError(null);
    try {
      const path = await pickFile(mode);
      if (!path) return;
      setUploading(true);
      await onImportAttachment(source.id, path);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = (attachment: SourceAttachment) => {
    if (window.confirm(`Delete attachment "${attachment.file_name}"?`)) {
      void onDeleteAttachment(source.id, attachment.id, attachment.relative_path);
    }
  };

  const media = source.attachments.filter(a => {
    const mime = a.mime_type?.toLowerCase() ?? '';
    return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
  });
  const documents = source.attachments.filter(a => !media.includes(a));

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Source Details</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" title="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="select"
            >
              {SOURCE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="input" placeholder="https://…" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Raw Text</label>
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} className="textarea" rows={5} />
          </div>

          <SourceDateTimeFields
            date={sourceDate}
            time={sourceTime}
            onChange={({ date, time }) => {
              setSourceDate(date);
              setSourceTime(time);
            }}
            onValidityChange={setTimeValid}
          />

          <section className="card p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">NATO Admiralty Rating</h3>

            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Source Reliability (A–F)</label>
              <select value={reliabilityCode} onChange={(e) => setReliabilityCode(e.target.value)} className="select">
                <option value="">Not rated</option>
                {RELIABILITY_CODES.map(code => (
                  <option key={code} value={code}>{RELIABILITY_DEFINITIONS[code].label}</option>
                ))}
              </select>
              {reliabilityCode && (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {RELIABILITY_DEFINITIONS[reliabilityCode as keyof typeof RELIABILITY_DEFINITIONS].description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Information Credibility (1–6)</label>
              <select value={credibilityCode} onChange={(e) => setCredibilityCode(e.target.value)} className="select">
                <option value="">Not rated</option>
                {CREDIBILITY_CODES.map(code => (
                  <option key={code} value={code}>{CREDIBILITY_DEFINITIONS[code].label}</option>
                ))}
              </select>
              {credibilityCode && (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {CREDIBILITY_DEFINITIONS[Number(credibilityCode) as keyof typeof CREDIBILITY_DEFINITIONS].description}
                </p>
              )}
            </div>
          </section>

          {isEvent && (
            <section className="card p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3">Stance on Event</h3>
              <select value={stance} onChange={(e) => setStance(e.target.value)} className="select">
                <option value="">{STANCE_NONE_LABEL}</option>
                {STANCES.map(value => (
                  <option key={value} value={value}>{STANCE_DEFINITIONS[value].label}</option>
                ))}
              </select>
              {stance ? (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {STANCE_DEFINITIONS[stance as Stance].description}
                </p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  No stance recorded. Use this when the source does not bear on the event.
                </p>
              )}
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">
                Attachments ({source.attachments.length})
              </h3>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => void handleAttach('media')}
                  disabled={uploading}
                  title="Attach an image, video, or audio file"
                >
                  {uploading ? 'Importing…' : 'Add Media'}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => void handleAttach('any')}
                  disabled={uploading}
                  title="Attach any file"
                >
                  Add File
                </button>
              </div>
            </div>

            {uploadError && (
              <p className="mb-2 text-xs text-red-400">{uploadError}</p>
            )}

            {source.attachments.length === 0 ? (
              <p className="text-xs text-zinc-500">No attachments.</p>
            ) : (
              <div className="space-y-3">
                {media.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {media.map(attachment => (
                      <MediaPreview
                        key={attachment.id}
                        attachment={attachment}
                        resolveUrl={resolveAttachmentUrl}
                        onOpen={(path) => void onOpenAttachment(path)}
                        onDelete={handleDeleteAttachment}
                      />
                    ))}
                  </div>
                )}
                {documents.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {documents.map(attachment => (
                      <MediaPreview
                        key={attachment.id}
                        attachment={attachment}
                        resolveUrl={resolveAttachmentUrl}
                        onOpen={(path) => void onOpenAttachment(path)}
                        onDelete={handleDeleteAttachment}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Location</h3>
            <p className="text-[11px] text-zinc-500 mb-3">
              Optional. Geolocated sources appear on the event dashboard map.
            </p>

            <div className="mb-3">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Coordinates</label>
              <input
                type="text"
                value={coordText}
                onChange={(e) => {
                  const text = e.target.value;
                  setCoordText(text);
                  setCoordError(null);
                  // Keep the canonical value in step with what is typed.
                  setCoord(parseCoordinateIn(text, coordFormat));
                }}
                className="input font-mono"
                placeholder={FORMAT_HINTS[coordFormat]}
                spellCheck={false}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COORDINATE_FORMATS.map(format => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => handleFormatChange(format)}
                    aria-pressed={coordFormat === format}
                    title={`Show as ${FORMAT_LABELS[format]} (${FORMAT_HINTS[format]})`}
                    className={
                      coordFormat === format
                        ? 'px-2 py-1 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'px-2 py-1 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600'
                    }
                  >
                    {FORMAT_LABELS[format]}
                  </button>
                ))}
              </div>
              {coordError && <p className="mt-1.5 text-[11px] text-red-400">{coordError}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Place name</label>
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                className="input"
                placeholder="London, UK"
              />
            </div>

            {coord && isValidCoordinate(coord.lat, coord.lon) && (
              <p className="mt-2 text-[11px] text-zinc-500">
                {formatCoordinate(coord.lat, coord.lon)}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Custom Metadata</h3>
            <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto">
              {formatMetadata(source.custom_metadata)}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-zinc-800">
          <span className="text-xs text-red-400">{saveError}</span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
              Close
            </button>
            <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || !title.trim() || !timeValid}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function formatMetadata(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Formats a coordinate, falling back to decimal degrees when the requested
 * notation cannot represent it (MGRS stops at 84°N, for example).
 */
function safeFormat(lat: number, lon: number, format: CoordinateFormat): string {
  try {
    return formatCoordinateIn(lat, lon, format);
  } catch {
    return formatCoordinateIn(lat, lon, 'dd');
  }
}

/** Parses stored metadata, tolerating malformed JSON. */
function parseMetadata(raw: string): SourceCustomMetadata {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as SourceCustomMetadata;
    }
  } catch {
    // fall through
  }
  return {};
}