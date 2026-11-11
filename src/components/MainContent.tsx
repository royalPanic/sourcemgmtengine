import { useState } from 'react';
import { CaseNotesEditor } from './CaseNotesEditor';
import { CaseHeader } from './CaseHeader';
import { WorkspaceTab } from './WorkspaceTab';
import { Dashboard } from './Dashboard';
import { useCaseNote } from '../hooks/useCases';
import type { Case, SourceWithAttachments, SourceType, SourceCustomMetadata, Stance, Entity, EntityType } from '../types';

type Tab = 'notes' | 'workspace' | 'dashboard';

interface MainContentProps {
  container: Case | null;
  sources: SourceWithAttachments[];
  sourcesLoading: boolean;
  entities: Entity[];
  entitiesLoading: boolean;
  entityTypes: EntityType[];
  onUpdateContainer: (id: string, params: Partial<{
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
  }>) => Promise<unknown>;
  onCreateSource: (params: {
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
  }) => Promise<SourceWithAttachments>;
  onUpdateSource: (id: string, params: Partial<{
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
  }>) => Promise<unknown>;
  onDeleteSource: (id: string) => Promise<void>;
  onImportAttachment: (sourceId: string, sourcePath: string) => Promise<unknown>;
  onDeleteAttachment: (sourceId: string, attachmentId: string, relativePath: string) => Promise<void>;
  onOpenAttachment: (relativePath: string) => Promise<void>;
  onOpenSourceDetail: (source: SourceWithAttachments) => void;
  onCreateEntity: (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }) => Promise<void>;
  onDeleteEntity: (id: string) => Promise<void>;
  onOpenEntityDetail: (entity: Entity) => void;
}

export function MainContent({
  container,
  sources,
  sourcesLoading,
  entities,
  entitiesLoading,
  entityTypes,
  onUpdateContainer,
  onCreateSource,
  onUpdateSource,
  onDeleteSource,
  onImportAttachment,
  onDeleteAttachment,
  onOpenAttachment,
  onOpenSourceDetail,
  onCreateEntity,
  onDeleteEntity,
  onOpenEntityDetail,
}: MainContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const caseId = container?.id ?? null;
  const { note, loading: noteLoading, saving, saveNote } = useCaseNote(caseId);

  if (!container) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-xl font-medium text-zinc-400">Nothing Selected</h2>
          <p className="text-zinc-500 mt-2">Select a case from the sidebar, or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <CaseHeader
        container={container}
        onUpdate={onUpdateContainer}
      />

      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4">
        <div className="flex gap-1 p-2">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'notes'
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Notes
            </span>
            {saving && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'workspace'
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Workspace
            </span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Dashboard
            </span>
          </button>
        </div>
      </div>

      {/* Must be a flex column so each tab's `flex-1` resolves to the available
          height; otherwise tall tabs overflow and get clipped instead of scrolling. */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'notes' && (
          <CaseNotesEditor
            key={caseId}
            content={note?.content || ''}
            onSave={saveNote}
            loading={noteLoading}
            saving={saving}
          />
        )}
        {activeTab === 'workspace' && (
          <WorkspaceTab
            caseId={caseId}
            sources={sources}
            sourcesLoading={sourcesLoading}
            entities={entities}
            entitiesLoading={entitiesLoading}
            entityTypes={entityTypes}
            onCreateSource={onCreateSource}
            onUpdateSource={onUpdateSource}
            onDeleteSource={onDeleteSource}
            onImportAttachment={onImportAttachment}
            onDeleteAttachment={onDeleteAttachment}
            onOpenAttachment={onOpenAttachment}
            onOpenSourceDetail={onOpenSourceDetail}
            onCreateEntity={onCreateEntity}
            onDeleteEntity={onDeleteEntity}
            onOpenEntityDetail={onOpenEntityDetail}
          />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard sources={sources} loading={sourcesLoading} />
        )}
      </div>
    </div>
  );
}