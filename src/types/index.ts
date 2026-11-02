export interface Case {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseNote {
  id: string;
  case_id: string;
  content: string;
  updated_at: string;
}

export type SourceType = 'URL' | 'Document' | 'Social Media' | 'Image' | 'Video' | 'Audio' | 'Other';

export type ReliabilityCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type CredibilityCode = 1 | 2 | 3 | 4 | 5 | 6;

export interface SourceCustomMetadata {
  // Dynamic key-value pairs for specialized OSINT workflows
  [key: string]: string | number | boolean | null | undefined;
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

export interface SourceWithAttachments extends Source {
  attachments: SourceAttachment[];
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

export const SOURCE_TYPES: SourceType[] = ['URL', 'Document', 'Social Media', 'Image', 'Video', 'Audio', 'Other'];

export const RELIABILITY_CODES: ReliabilityCode[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const CREDIBILITY_CODES: CredibilityCode[] = [1, 2, 3, 4, 5, 6];