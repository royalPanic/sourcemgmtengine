import { useState } from 'react';
import type {
  Case,
  SourceWithAttachments,
  SourceType,
  SourceCustomMetadata,
  Stance,
  Entity,
  EntityType,
  EntityTypeQuality,
} from '../types';
import { SourcesGrid } from './SourcesGrid';
import { EntitiesPanel } from './EntitiesPanel';

type WorkspaceTab = 'sources' | 'entities';

interface WorkspaceTabProps {
  caseId: string | null;
  cases: Case[];
  sources: SourceWithAttachments[];
  sourcesLoading: boolean;
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
    referenceEntityId?: string;
    sourceDate?: string;
    sourceTime?: string;
    customMetadata?: SourceCustomMetadata;
  }) => Promise<SourceWithAttachments>;
  onDeleteSource: (id: string) => Promise<void>;
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
  /** The entity currently open in the detail drawer, owned by `App`. */
  selectedEntityId: string | null;
  onCreateType: (params: {
    id: string;
    name: string;
    description?: string;
    defaultQualities: EntityTypeQuality[];
  }) => Promise<void>;
  onUpdateType: (id: string, params: Partial<{
    name: string;
    description: string;
    defaultQualities: EntityTypeQuality[];
  }>) => Promise<void>;
  onDeleteType: (id: string) => Promise<void>;
}

const TAB_LABELS: Record<WorkspaceTab, string> = {
  sources: 'Sources',
  entities: 'Entities',
};

export function WorkspaceTab({
  caseId,
  cases,
  sources,
  sourcesLoading,
  entities,
  entitiesLoading,
  entityTypes,
  onCreateSource,
  onDeleteSource,
  onOpenSourceDetail,
  onCreateEntity,
  onDeleteEntity,
  onOpenEntityDetail,
  selectedEntityId,
  onCreateType,
  onUpdateType,
  onDeleteType,
}: WorkspaceTabProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sources');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4">
        <div className="flex gap-1 p-2">
          {(['sources', 'entities'] as const).map((tab) => (
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
            entities={entities}
            onCreateSource={onCreateSource}
            onDeleteSource={onDeleteSource}
            onOpenDetail={onOpenSourceDetail}
          />
        )}
        {activeTab === 'entities' && (
          <EntitiesPanel
            selectedCaseId={caseId}
            cases={cases}
            entities={entities}
            entityTypes={entityTypes}
            loading={entitiesLoading}
            onCreateEntity={onCreateEntity}
            onDeleteEntity={onDeleteEntity}
            onOpenEntityDetail={onOpenEntityDetail}
            selectedEntityId={selectedEntityId}
            onCreateType={onCreateType}
            onUpdateType={onUpdateType}
            onDeleteType={onDeleteType}
          />
        )}
      </div>
    </div>
  );
}
