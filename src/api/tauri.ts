import { invoke } from '@tauri-apps/api/core';
import type { Case, CaseNote, Source, SourceWithAttachments, SourceType, SourceCustomMetadata, SourceAttachment } from '../types';

// Tauri v2 maps Rust snake_case command parameters to camelCase on the JS side,
// so every argument below must be camelCase.
export const casesApi = {
  create: (title: string, description?: string) => 
    invoke<Case>('create_case', { title, description }),
  
  getAll: () => 
    invoke<Case[]>('get_cases'),
  
  get: (id: string) => 
    invoke<Case | null>('get_case', { id }),
  
  update: (id: string, title?: string, description?: string) => 
    invoke<Case>('update_case', { id, title, description }),
  
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
    customMetadata?: SourceCustomMetadata;
  }) => invoke<Source>('create_source', {
    caseId: params.caseId,
    title: params.title,
    sourceType: params.sourceType,
    url: params.url,
    rawText: params.rawText,
    reliabilityCode: params.reliabilityCode,
    credibilityCode: params.credibilityCode,
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
    customMetadata: SourceCustomMetadata;
  }>) => invoke<Source>('update_source', {
    id,
    title: params.title,
    sourceType: params.sourceType,
    url: params.url,
    rawText: params.rawText,
    reliabilityCode: params.reliabilityCode,
    credibilityCode: params.credibilityCode,
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

export const filesApi = {
  saveAttachment: (sourceId: string, fileName: string, data: Uint8Array) => 
    invoke<string>('save_attachment', { sourceId, fileName, data: Array.from(data) }),
  
  readAttachment: (relativePath: string) => 
    invoke<number[]>('read_attachment', { relativePath }).then(arr => new Uint8Array(arr)),
  
  deleteAttachmentFile: (relativePath: string) => 
    invoke<void>('delete_attachment_file', { relativePath }),
  
  openAttachment: (relativePath: string) => 
    invoke<void>('open_attachment', { relativePath }),
  
  getAttachmentPath: (relativePath: string) => 
    invoke<string>('get_attachment_path', { relativePath }),
};