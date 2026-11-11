export type ContainerKind = 'case';

/** How a source bears on the event it belongs to. `null` = none / not applicable. */
export type Stance = 'supports' | 'refutes' | 'neutral';

export interface Case {
  id: string;
  title: string;
  description: string | null;
  kind: ContainerKind;
  /** Calendar date, `YYYY-MM-DD`. Optional for any case. */
  event_date: string | null;
  /** Wall-clock time, `HH:MM`. Optional even for events. */
  event_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseNote {
  id: string;
  case_id: string;
  content: string;
  updated_at: string;
}

export type SourceType = 'URL' | 'Document' | 'Social Media' | 'Image' | 'Video' | 'Audio' | 'Media' | 'Other';

export type ReliabilityCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type CredibilityCode = 1 | 2 | 3 | 4 | 5 | 6;

export interface SourceCustomMetadata {
  // Dynamic key-value pairs for specialized OSINT workflows
  [key: string]: string | number | boolean | null | undefined;
}

// --- Entities ---

/** A quality data type. */
export type QualityType = 'string' | 'boolean' | 'integer' | 'date' | 'coordinates' | 'address' | 'reliability';

export const QUALITY_TYPES: QualityType[] = ['string', 'boolean', 'integer', 'date', 'coordinates', 'address', 'reliability'];

/** Which table a source's reference points at. */
export type ReferenceKind = 'source' | 'entity';

/** A resolved reference, labelled for display. */
export interface SourceReference {
  kind: ReferenceKind;
  id: string;
  label: string;
  reliability_code: ReliabilityCode | null;
  credibility_code: CredibilityCode | null;
}

export interface Source {
  id: string;
  case_id: string;
  title: string;
  source_type: SourceType;
  url: string | null;
  raw_text: string | null;
  reliability_code: ReliabilityCode | null;
  credibility_code: CredibilityCode | null;
  stance: Stance | null;
  /** Sibling source in the same container this source reports on. */
  reference_source_id: string | null;
  /** Entity this source reports on. Mutually exclusive with the above. */
  reference_entity_id: string | null;
  /** Optional calendar date the source itself refers to, `YYYY-MM-DD`. */
  source_date: string | null;
  /** Optional wall-clock time, `HH:MM`. Requires `source_date`. */
  source_time: string | null;
  custom_metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface SourceAttachment {
  id: string;
  source_id: string;
  file_name: string;
  relative_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

/** Result of copying a file from disk into the app's attachment store. */
export interface ImportedAttachment {
  file_name: string;
  relative_path: string;
  mime_type: string;
  file_size: number;
}

/** Status of an OpenTimestamps timestamp proof. */
export type TimestampStatus = 'pending' | 'confirmed' | 'failed';

/** A recorded OpenTimestamps timestamp proof for an attachment. */
export interface TimestampRecord {
  id: string;
  source_attachment_id: string;
  ots_path: string;
  status: TimestampStatus;
  created_at: string;
  confirmed_at: string | null;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'other';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff'];
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

/** Classifies an attachment by MIME type, falling back to the file extension. */
export function mediaKind(attachment: SourceAttachment): MediaKind {
  const mime = attachment.mime_type?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  const ext = attachment.file_name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'other';
}

export interface SourceWithAttachments extends Source {
  attachments: SourceAttachment[];
  /** Resolved reference, so the UI can label a citation without another call. */
  reference: SourceReference | null;
}

export interface CaseWithDetails extends Case {
  notes?: CaseNote;
  sources?: SourceWithAttachments[];
  source_count?: number;
}

// NATO Admiralty System definitions
export const RELIABILITY_DEFINITIONS: Record<ReliabilityCode, { label: string; description: string }> = {
  A: { label: 'A - Completely Reliable', description: 'No doubt about authenticity, trustworthiness, or competency. History of complete reliability.' },
  B: { label: 'B - Usually Reliable', description: 'Minor doubt about authenticity, trustworthiness, or competency. History of valid information most of the time.' },
  C: { label: 'C - Fairly Reliable', description: 'Doubt about authenticity, trustworthiness, or competency. Provided valid information in the past but also some invalid.' },
  D: { label: 'D - Not Usually Reliable', description: 'Significant doubt about authenticity, trustworthiness, or competency. History of mostly invalid information.' },
  E: { label: 'E - Unreliable', description: 'Lacks authenticity, trustworthiness, or competency. History of invalid information.' },
  F: { label: 'F - Reliability Cannot Be Judged', description: 'Insufficient information to evaluate. May or may not be reliable.' },
};

export const CREDIBILITY_DEFINITIONS: Record<CredibilityCode, { label: string; description: string }> = {
  1: { label: '1 - Confirmed by Other Sources', description: 'Information confirmed by independent sources; logical and consistent with other known facts.' },
  2: { label: '2 - Probably True', description: 'Not confirmed but logical, consistent with other known facts, and no reason to doubt.' },
  3: { label: '3 - Possibly True', description: 'Not confirmed but reasonably logical and consistent with some known facts.' },
  4: { label: '4 - Doubtful', description: 'Not confirmed, possible but not logical, or inconsistent with other known facts.' },
  5: { label: '5 - Improbable', description: 'Not confirmed, not logical, and contradicted by other known facts.' },
  6: { label: '6 - Truth Cannot Be Judged', description: 'Insufficient information to evaluate credibility. May or may not be true.' },
};

export const SOURCE_TYPES: SourceType[] = ['URL', 'Document', 'Social Media', 'Image', 'Video', 'Audio', 'Media', 'Other'];

export const RELIABILITY_CODES: ReliabilityCode[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const CREDIBILITY_CODES: CredibilityCode[] = [1, 2, 3, 4, 5, 6];

export const STANCES: Stance[] = ['supports', 'refutes', 'neutral'];

export const STANCE_DEFINITIONS: Record<Stance, { label: string; description: string }> = {
  supports: {
    label: 'Supports',
    description: 'This source corroborates that the event occurred as described.',
  },
  refutes: {
    label: 'Refutes',
    description: 'This source contradicts or undermines the event as described.',
  },
  neutral: {
    label: 'Neutral',
    description: 'This source mentions the event without corroborating or contradicting it.',
  },
};

/** Label for the "no stance" option, used on events and forced on plain cases. */
export const STANCE_NONE_LABEL = 'None / N/A';

// --- Entities ---

/** A single quality definition within an entity type template. */
export interface EntityTypeQuality {
  name: string;
  type: QualityType;
  required: boolean;
}

/** An entity type template, loaded from a JSON file. */
export interface EntityType {
  id: string;
  name: string;
  description: string | null;
  default_qualities: EntityTypeQuality[];
}

/** A stored entity. */
export interface Entity {
  id: string;
  entity_type: string;
  name: string;
  description: string | null;
  case_id: string | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

/** A stored quality on an entity. */
export interface EntityQuality {
  id: string;
  entity_id: string;
  quality_name: string;
  quality_type: QualityType;
  value_string: string | null;
  value_integer: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_coordinates: string | null;
  value_address: string | null;
  created_at: string;
  updated_at: string;
}

/** A link between a quality and a source, carrying the source's Admiralty rating at citation time. */
export interface QualitySourceRef {
  id: string;
  quality_id: string;
  source_id: string;
  source_title: string | null;
  reliability_code: ReliabilityCode | null;
  credibility_code: CredibilityCode | null;
  created_at: string;
}

/** A quality plus the sources referenced as provenance. */
export interface EntityQualityWithRefs extends EntityQuality {
  source_refs: QualitySourceRef[];
}

/** Computes the average Admiralty rating for a quality's source references. */
export function admiraltyAverage(refs: QualitySourceRef[]): {
  reliability: ReliabilityCode | null;
  credibility: CredibilityCode | null;
} {
  if (refs.length === 0) {
    return { reliability: null, credibility: null };
  }

  const reliabilityScores: number[] = [];
  const credibilityScores: number[] = [];

  for (const ref_ of refs) {
    if (ref_.reliability_code) {
      const score = RELIABILITY_CODES.indexOf(ref_.reliability_code) + 1;
      if (score > 0) reliabilityScores.push(score);
    }
    if (ref_.credibility_code != null) {
      credibilityScores.push(ref_.credibility_code);
    }
  }

  const avgReliability = reliabilityScores.length > 0
    ? RELIABILITY_CODES[Math.round(reliabilityScores.reduce((a, b) => a + b, 0) / reliabilityScores.length) - 1]
    : null;
  const avgCredibility = credibilityScores.length > 0
    ? Math.round(credibilityScores.reduce((a, b) => a + b, 0) / credibilityScores.length) as CredibilityCode
    : null;

  return { reliability: avgReliability, credibility: avgCredibility };
}