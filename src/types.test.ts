import { describe, it, expect } from 'vitest';
import { SOURCE_TYPES, formatQualityValue, mediaKind } from './types';
import type { EntityQuality, SourceAttachment } from './types';

describe('SOURCE_TYPES', () => {
  it('includes Media as a source type', () => {
    expect(SOURCE_TYPES).toContain('Media');
  });
});

describe('formatQualityValue', () => {
  const base: EntityQuality = {
    id: 'q1',
    entity_id: 'e1',
    quality_name: 'Test',
    quality_type: 'string',
    value_string: null,
    value_integer: null,
    value_boolean: null,
    value_date: null,
    value_coordinates: null,
    value_address: null,
    created_at: '',
    updated_at: '',
  };

  it('renders only the column matching the quality type', () => {
    // A leftover value_string must not win for an integer quality.
    expect(formatQualityValue({
      ...base,
      quality_type: 'integer',
      value_string: 'stale',
      value_integer: 42,
    })).toBe('42');
  });

  it('renders an integer of zero', () => {
    expect(formatQualityValue({ ...base, quality_type: 'integer', value_integer: 0 })).toBe('0');
  });

  it('renders booleans as True and False', () => {
    expect(formatQualityValue({ ...base, quality_type: 'boolean', value_boolean: true })).toBe('True');
    expect(formatQualityValue({ ...base, quality_type: 'boolean', value_boolean: false })).toBe('False');
  });

  it('renders strings and reliability codes from value_string', () => {
    expect(formatQualityValue({ ...base, quality_type: 'string', value_string: 'American' })).toBe('American');
    expect(formatQualityValue({ ...base, quality_type: 'reliability', value_string: 'B' })).toBe('B');
  });

  it('renders dates, coordinates, and addresses from their own columns', () => {
    expect(formatQualityValue({ ...base, quality_type: 'date', value_date: '2026-01-01' })).toBe('2026-01-01');
    expect(formatQualityValue({ ...base, quality_type: 'coordinates', value_coordinates: '1,2' })).toBe('1,2');
    expect(formatQualityValue({ ...base, quality_type: 'address', value_address: '1 Main St' })).toBe('1 Main St');
  });

  it('falls back to an em dash when the value is unset', () => {
    expect(formatQualityValue(base)).toBe('—');
    expect(formatQualityValue({ ...base, quality_type: 'integer' })).toBe('—');
    expect(formatQualityValue({ ...base, quality_type: 'boolean' })).toBe('—');
  });
});

describe('mediaKind', () => {
  const attachment = (mime_type: string | null, file_name: string): SourceAttachment => ({
    id: 'a1',
    source_id: 's1',
    file_name,
    relative_path: `attachments/s1/${file_name}`,
    mime_type,
    file_size: 1,
    created_at: '',
  });

  it('classifies by MIME type when it is specific', () => {
    expect(mediaKind(attachment('video/mp4', 'clip.bin'))).toBe('video');
    expect(mediaKind(attachment('image/png', 'shot.bin'))).toBe('image');
    expect(mediaKind(attachment('audio/mpeg', 'sound.bin'))).toBe('audio');
  });

  it('falls back to the extension when the MIME type is generic', () => {
    // A downloaded or imported video can be stored as octet-stream; the drawer
    // and preview must still treat it as media, not as a document.
    expect(mediaKind(attachment('application/octet-stream', 'clip.mp4'))).toBe('video');
    expect(mediaKind(attachment(null, 'clip.webm'))).toBe('video');
    expect(mediaKind(attachment(null, 'shot.jpeg'))).toBe('image');
  });

  it('reports other for a genuine document', () => {
    expect(mediaKind(attachment('application/pdf', 'brief.pdf'))).toBe('other');
  });
});
