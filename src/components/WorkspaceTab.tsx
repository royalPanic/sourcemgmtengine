import { useState } from 'react';
import type {
  SourceWithAttachments,
  SourceType,
  SourceCustomMetadata,
  Stance,
  MetaSourceSummary,
  Entity,
  EntityType,
  MetaSourceKind,
} from '../types';
import { SourcesGrid } from './SourcesGrid';
import { MetaSourcesPanel } from './MetaSourcesPanel';
import { EntitiesPanel } from './EntitiesPanel';

type WorkspaceTab = 'sources' | 'metaSources' | 'entities';

interface WorkspaceTabProps {
  caseId: string | null;
  sources: SourceWithAttachments[];
  sourcesLoading: boolean;
  metaSources: MetaSourceSummary[];
  metaSourcesLoading: boolean;
  entities: Entity[];
  entitiesLoading: boolean;
  entityTypes: EntityType[];
  onCreateSource: (params: {
    title: string;
    sourceType: SourceType;
    url?: string;
    rawText?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
    stance?: Stance;
    referenceSourceId?: string;
    referenceMetaSourceId?: string;
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
    referenceMetaSourceId: string;
    sourceDate: string;
    sourceTime: string;
    customMetadata: SourceCustomMetadata;
  }>) => Promise<unknown>;
  onDeleteSource: (id: string) => Promise<void>;
  onImportAttachment: (sourceId: string, sourcePath: string) => Promise<unknown>;
  onDeleteAttachment: (sourceId: string, attachmentId: string, relativePath: string) => Promise<void>;
  onOpenAttachment: (relativePath: string) => Promise<void>;
  onOpenSourceDetail: (source: SourceWithAttachments) => void;
  onCreateMetaSource: (params: {
    name: string;
    kind?: MetaSourceKind;
    description?: string;
    url?: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => Promise<unknown>;
  onUpdateMetaSource: (id: string, params: Partial<{
    name: string;
    kind: MetaSourceKind;
    description: string;
    url: string;
    reliabilityCode: string;
    credibilityCode: number;
  }>) => Promise<unknown>;
  onDeleteMetaSource: (id: string) => Promise<void>;
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

const TAB_LABELS: Record<WorkspaceTab, string> = {
  sources: 'Sources',
  metaSources: 'Meta Sources',
  entities: 'Entities',
};

export function WorkspaceTab({
  caseId,
  sources,
  sourcesLoading,
  metaSources,
  metaSourcesLoading,
  entities,
  entitiesLoading,
  entityTypes,
  onCreateSource,
  onUpdateSource,
  onDeleteSource,
  onImportAttachment,
  onDeleteAttachment,
  onOpenAttachment,
  onOpenSourceDetail,
  onCreateMetaSource,
  onUpdateMetaSource,
  onDeleteMetaSource,
  onCreateEntity,
  onDeleteEntity,
  onOpenEntityDetail,
}: WorkspaceTabProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sources');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4">
        <div className="flex gap-1 p-2">
          {(['sources', 'metaSources', 'entities'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
              }`}
            >
              {TAB_LABELS[tab]} (
              {tab === 'sources'
                ? sources.length
                : tab === 'metaSources'
                  ? metaSources.length
                  : entities.length})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'sources' && (
          <SourcesGrid
            sources={sources}
            loading={sourcesLoading}
            metaSources={metaSources}
            onCreateSource={onCreateSource}
            onUpdateSource={onUpdateSource}
            onDeleteSource={onDeleteSource}
            onImportAttachment={onImportAttachment}
            onDeleteAttachment={onDeleteAttachment}
            onOpenAttachment={onOpenAttachment}
            onOpenDetail={onOpenSourceDetail}
          />
        )}
        {activeTab === 'metaSources' && (
          <MetaSourcesPanel
            metaSources={metaSources}
            loading={metaSourcesLoading}
            onCreate={onCreateMetaSource}
            onUpdate={onUpdateMetaSource}
            onDelete={onDeleteMetaSource}
          />
        )}
        {activeTab === 'entities' && (
          <EntitiesPanel
            selectedCaseId={caseId}
            entities={entities}
            entityTypes={entityTypes}
            loading={entitiesLoading}
            onCreateEntity={onCreateEntity}
            onDeleteEntity={onDeleteEntity}
            onOpenEntityDetail={onOpenEntityDetail}
          />
        )}
      </div>
    </div>
  );
}
