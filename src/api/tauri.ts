import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { Case, CaseNote, Source, SourceWithAttachments, SourceType, SourceCustomMetadata, SourceAttachment, ImportedAttachment, TimestampRecord, ContainerKind, Stance } from '../types';
import type { Entity, EntityQuality, EntityQualityWithRefs, EntityType, QualitySourceRef, QualityType, ReliabilityCode, CredibilityCode } from '../types';

// Tauri v2 maps Rust snake_case command parameters to camelCase on the JS side,
// so every argument below must be camelCase.
export const casesApi = {
  create: (params: {
    title: string;
    description?: string;
    kind?: ContainerKind;
    eventDate?: string;
    eventTime?: string;
  }) => invoke<Case>('create_case', {
    title: params.title,
    description: params.description,
    kind: params.kind,
    eventDate: params.eventDate,
    eventTime: params.eventTime,
  }),
  
  getAll: () => 
    invoke<Case[]>('get_cases'),
  
  get: (id: string) => 
    invoke<Case | null>('get_case', { id }),
  
  update: (id: string, params: Partial<{
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
  }>) => invoke<Case>('update_case', {
    id,
    title: params.title,
    description: params.description,
    // An empty string clears the stored value; omitting the key leaves it alone.
    eventDate: params.eventDate,
    eventTime: params.eventTime,
  }),
  
  delete: (id: string) => 
    invoke<void>('delete_case', { id }),
  
  getNote: (caseId: string) => 
    invoke<CaseNote | null>('get_case_note', { caseId }),
  
  updateNote: (caseId: string, content: string) => 
    invoke<CaseNote>('update_case_note', { caseId, content }),
};

export const sourcesApi = {
  create: (params: {
    caseId: string;
    title: string;
    sourceType: SourceType;
    url?: string;
    rawText?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
    stance?: Stance;
    referenceSourceId?: string;
    referenceEntityId?: string;
    sourceDate?: string;
    sourceTime?: string;
    customMetadata?: SourceCustomMetadata;
  }) => invoke<Source>('create_source', {
    caseId: params.caseId,
    title: params.title,
    sourceType: params.sourceType,
    url: params.url,
    rawText: params.rawText,
    reliabilityCode: params.reliabilityCode,
    credibilityCode: params.credibilityCode,
    stance: params.stance,
    referenceSourceId: params.referenceSourceId,
    referenceEntityId: params.referenceEntityId,
    sourceDate: params.sourceDate,
    sourceTime: params.sourceTime,
    customMetadata: params.customMetadata ?? {},
  }),
  
  getAll: (caseId: string) => 
    invoke<SourceWithAttachments[]>('get_sources', { caseId }),
  
  get: (id: string) => 
    invoke<SourceWithAttachments | null>('get_source', { id }),
  
  update: (id: string, params: Partial<{
    title: string;
    sourceType: SourceType;
    url: string;
    rawText: string;
    reliabilityCode: string;
    credibilityCode: number;
    stance: Stance;
    referenceSourceId: string;
    referenceEntityId: string;
    sourceDate: string;
    sourceTime: string;
    customMetadata: SourceCustomMetadata;
  }>) => invoke<Source>('update_source', {
    id,
    title: params.title,
    sourceType: params.sourceType,
    url: params.url,
    rawText: params.rawText,
    reliabilityCode: params.reliabilityCode,
    credibilityCode: params.credibilityCode,
    stance: params.stance,
    // An empty string clears the reference; omitting the key leaves it alone.
    referenceSourceId: params.referenceSourceId,
    referenceEntityId: params.referenceEntityId,
    // An empty string clears the stored value; omitting the key leaves it alone.
    sourceDate: params.sourceDate,
    sourceTime: params.sourceTime,
    customMetadata: params.customMetadata,
  }),
  
  delete: (id: string) => 
    invoke<void>('delete_source', { id }),
  
  addAttachment: (params: {
    sourceId: string;
    fileName: string;
    relativePath: string;
    mimeType?: string;
    fileSize?: number;
  }) => invoke<SourceAttachment>('add_source_attachment', {
    sourceId: params.sourceId,
    fileName: params.fileName,
    relativePath: params.relativePath,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
  }),
  
  deleteAttachment: (id: string) => 
    invoke<void>('delete_source_attachment', { id }),
};

export const entitiesApi = {
  getAll: () =>
    invoke<EntityType[]>('get_entity_types'),

  createEntity: (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }) => invoke<Entity>('create_entity', {
    entityType: params.entityType,
    name: params.name,
    description: params.description,
    caseId: params.caseId,
    isGlobal: params.isGlobal,
  }),

  getEntities: (caseId?: string, isGlobal?: boolean) =>
    invoke<Entity[]>('get_entities', { caseId, isGlobal }),

  getEntity: (id: string) =>
    invoke<Entity | null>('get_entity', { id }),

  updateEntity: (id: string, params: Partial<{
    name: string;
    description: string;
    caseId: string;
    isGlobal: boolean;
  }>) => invoke<Entity>('update_entity', {
    id,
    name: params.name,
    description: params.description,
    caseId: params.caseId,
    isGlobal: params.isGlobal,
  }),

  deleteEntity: (id: string) =>
    invoke<void>('delete_entity', { id }),
};

export const qualitiesApi = {
  create: (params: {
    entityId: string;
    qualityName: string;
    qualityType: QualityType;
    valueString?: string;
    valueInteger?: number;
    valueBoolean?: boolean;
    valueDate?: string;
    valueCoordinates?: string;
    valueAddress?: string;
  }) => invoke<EntityQuality>('create_entity_quality', {
    entityId: params.entityId,
    qualityName: params.qualityName,
    qualityType: params.qualityType,
    valueString: params.valueString,
    valueInteger: params.valueInteger,
    valueBoolean: params.valueBoolean,
    valueDate: params.valueDate,
    valueCoordinates: params.valueCoordinates,
    valueAddress: params.valueAddress,
  }),

  getAll: (entityId: string) =>
    invoke<EntityQualityWithRefs[]>('get_entity_qualities', { entityId }),

  update: (id: string, params: Partial<{
    qualityName: string;
    qualityType: QualityType;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => invoke<EntityQualityWithRefs>('update_entity_quality', {
    id,
    qualityName: params.qualityName,
    qualityType: params.qualityType,
    valueString: params.valueString,
    valueInteger: params.valueInteger,
    valueBoolean: params.valueBoolean,
    valueDate: params.valueDate,
    valueCoordinates: params.valueCoordinates,
    valueAddress: params.valueAddress,
  }),

  delete: (id: string) =>
    invoke<void>('delete_entity_quality', { id }),
};

export const qualitySourceRefsApi = {
  add: (params: {
    qualityId: string;
    sourceId: string;
    reliabilityCode?: ReliabilityCode;
    credibilityCode?: CredibilityCode;
  }) => invoke<QualitySourceRef>('add_quality_source_ref', {
    qualityId: params.qualityId,
    sourceId: params.sourceId,
    reliabilityCode: params.reliabilityCode,
    credibilityCode: params.credibilityCode,
  }),

  remove: (id: string) =>
    invoke<void>('remove_quality_source_ref', { id }),

  getAll: (qualityId: string) =>
    invoke<QualitySourceRef[]>('get_quality_source_refs', { qualityId }),
};

export const filesApi = {
  saveAttachment: (sourceId: string, fileName: string, data: Uint8Array) => 
    invoke<string>('save_attachment', { sourceId, fileName, data: Array.from(data) }),

  /** Copies a file from an absolute on-disk path into the attachment store. */
  importAttachment: (sourceId: string, sourcePath: string) =>
    invoke<ImportedAttachment>('import_attachment', { sourceId, sourcePath }),
  
  readAttachment: (relativePath: string) => 
    invoke<number[]>('read_attachment', { relativePath }).then(arr => new Uint8Array(arr)),
  
  deleteAttachmentFile: (relativePath: string) => 
    invoke<void>('delete_attachment_file', { relativePath }),
  
  downloadMedia: (sourceId: string, url: string) => 
    invoke<SourceAttachment>('download_media', { sourceId, url }),
  
  openAttachment: (relativePath: string) => 
    invoke<void>('open_attachment', { relativePath }),
  
  getAttachmentPath: (relativePath: string) => 
    invoke<string>('get_attachment_path', { relativePath }),

  /**
   * Resolves a stored relative path to an `asset:` URL the webview can render.
   * Requires the asset protocol to be enabled and scoped to the attachment tree.
   */
  assetUrl: async (relativePath: string) => {
    const absolute = await invoke<string>('get_attachment_path', { relativePath });
    return convertFileSrc(absolute);
  },
};

export const timestampApi = {
  timestampAttachment: (attachmentId: string) =>
    invoke<TimestampRecord>('timestamp_attachment', { attachmentId }),

  verifyTimestamp: (attachmentId: string) =>
    invoke<TimestampRecord>('verify_timestamp', { attachmentId }),

  getTimestampStatus: (attachmentId: string) =>
    invoke<TimestampRecord | null>('get_timestamp_status', { attachmentId }),
};