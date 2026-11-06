import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { DetailDrawer } from './components/DetailDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { MetaSourcesPanel } from './components/MetaSourcesPanel';
import { EntitiesPanel } from './components/EntitiesPanel';
import { EntityDetailDrawer } from './components/EntityDetailDrawer';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import { useMetaSources } from './hooks/useMetaSources';
import { useEntities } from './hooks/useEntities';
import { useEntityTypes } from './hooks/useEntityTypes';
import type { SourceWithAttachments, ContainerKind, Entity } from './types';

function App() {
  const { cases, loading, createCase, updateCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
  const [newContainerKind, setNewContainerKind] = useState<ContainerKind | null>(null);
  // The meta source manager replaces the container view rather than opening a
  // modal, because it is a workspace-level list with its own table.
  const [showMetaSources, setShowMetaSources] = useState(false);
  // The entities panel replaces the container view.
  const [showEntities, setShowEntities] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const {
    sources,
    loading: sourcesLoading,
    createSource,
    updateSource,
    deleteSource,
    importAttachment,
    deleteAttachment,
    openAttachment,
    getAttachmentUrl,
    downloadMedia,
    timestampAttachment,
    verifyTimestamp,
    getTimestampStatus,
    reloadQuietly: reloadSources,
  } = useSources(selectedCaseId);

  const {
    metaSources,
    loading: metaSourcesLoading,
    createMetaSource,
    updateMetaSource,
    deleteMetaSource,
  } = useMetaSources();

  const {
    entities,
    loading: entitiesLoading,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useEntities(selectedCaseId, showEntities ? undefined : true);

  const {
    types: entityTypes,
    loading: entityTypesLoading,
  } = useEntityTypes();

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setShowMetaSources(false);
    setShowEntities(false);
    setDrawerOpen(false);
    setDrawerSource(null);
    setSelectedEntity(null);
  };

  const handleOpenSourceDetail = (source: SourceWithAttachments) => {
    setDrawerSource(source);
    setDrawerOpen(true);
  };

  const handleOpenEntityDetail = (entity: Entity) => {
    setSelectedEntity(entity);
  };

  const handleCreateContainer = async (params: {
    title: string;
    description?: string;
    kind: ContainerKind;
    eventDate?: string;
    eventTime?: string;
  }) => {
    const created = await createCase(params);
    setSelectedCaseId(created.id);
    setShowMetaSources(false);
    setShowEntities(false);
    setNewContainerKind(null);
  };

  const handleDeleteCase = async (caseId: string) => {
    if (window.confirm('Are you sure you want to delete this container? This will also delete all associated sources and notes.')) {
      await deleteCase(caseId);
      if (selectedCaseId === caseId) {
        setSelectedCaseId(null);
      }
    }
  };

  // Editing a meta source re-rates every source that cites it, so the open
  // container needs refreshing too.
  const handleUpdateMetaSource: typeof updateMetaSource = async (id, params) => {
    const result = await updateMetaSource(id, params);
    await reloadSources();
    return result;
  };

  const handleDeleteMetaSource = async (id: string) => {
    await deleteMetaSource(id);
    await reloadSources();
  };

  const handleCreateEntity = async (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }): Promise<void> => {
    await createEntity(params);
    // If global, refresh the full list; if case-specific, the hook already
    // filters by caseId.
    setShowEntities(false);
  };

  const handleUpdateEntity = async (id: string, params: Partial<{
    name: string;
    description: string;
    caseId: string;
    isGlobal: boolean;
  }>) => {
    await updateEntity(id, params);
  };

  const handleDeleteEntity = async (id: string) => {
    await deleteEntity(id);
    if (selectedEntity?.id === id) {
      setSelectedEntity(null);
    }
  };

  const handleCreateQuality = async (_params: {
    entityId: string;
    qualityName: string;
    qualityType: string;
    valueString?: string | null;
    valueInteger?: number | null;
    valueBoolean?: boolean | null;
    valueDate?: string | null;
    valueCoordinates?: string | null;
    valueAddress?: string | null;
  }) => {
    // Qualities are created through the detail drawer.
  };

  const handleUpdateQuality = async (_id: string, _params: Partial<{
    qualityName: string;
    qualityType: string;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => {
    // Qualities are updated through the detail drawer.
  };

  const handleDeleteQuality = async (_id: string) => {
    // Qualities are deleted through the detail drawer.
  };

  const handleAddQualitySourceRef = async (_params: {
    qualityId: string;
    sourceId: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => {
    // Source refs are managed through the detail drawer.
  };

  const handleRemoveQualitySourceRef = async (_refId: string) => {
    // Source refs are managed through the detail drawer.
  };

  // Keep the open drawer in sync with the latest source state.
  const activeDrawerSource = drawerSource
    ? sources.find(s => s.id === drawerSource.id) ?? drawerSource
    : null;

  // A source cannot reference itself, so the drawer offers the others.
  const drawerSiblings = activeDrawerSource
    ? sources.filter(s => s.id !== activeDrawerSource.id)
    : [];

  const view = showMetaSources ? 'metaSources' : showEntities ? 'entities' : 'content';

  return (
    <div className="h-screen w-full flex bg-zinc-950">
      <Sidebar
        cases={cases}
        loading={loading}
        selectedCaseId={selectedCaseId}
        metaSourcesActive={showMetaSources}
        entitiesActive={showEntities}
        onSelectCase={handleSelectCase}
        onOpenMetaSources={() => {
          setShowMetaSources(true);
          setShowEntities(false);
          setDrawerOpen(false);
          setDrawerSource(null);
          setSelectedEntity(null);
        }}
        onOpenEntities={() => {
          setShowEntities(true);
          setShowMetaSources(false);
          setDrawerOpen(false);
          setDrawerSource(null);
          setSelectedEntity(null);
        }}
        onCreateCase={() => setNewContainerKind('case')}
        onCreateEvent={() => setNewContainerKind('event')}
        onDeleteCase={handleDeleteCase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === 'metaSources' ? (
          <MetaSourcesPanel
            metaSources={metaSources}
            loading={metaSourcesLoading}
            onCreate={createMetaSource}
            onUpdate={handleUpdateMetaSource}
            onDelete={handleDeleteMetaSource}
          />
        ) : view === 'entities' ? (
          <EntitiesPanel
            entities={entities}
            entityTypes={entityTypes}
            loading={entitiesLoading || entityTypesLoading}
            onCreateEntity={handleCreateEntity}
            onUpdateEntity={handleUpdateEntity}
            onDeleteEntity={handleDeleteEntity}
            onCreateQuality={handleCreateQuality}
            onUpdateQuality={handleUpdateQuality}
            onDeleteQuality={handleDeleteQuality}
            onAddQualitySourceRef={handleAddQualitySourceRef}
            onRemoveQualitySourceRef={handleRemoveQualitySourceRef}
            onOpenEntityDetail={handleOpenEntityDetail}
          />
        ) : (
          <MainContent
            container={selectedCase}
            sources={sources}
            sourcesLoading={sourcesLoading}
            metaSources={metaSources}
            onUpdateContainer={updateCase}
            onCreateSource={createSource}
            onUpdateSource={updateSource}
            onDeleteSource={deleteSource}
            onImportAttachment={importAttachment}
            onDeleteAttachment={deleteAttachment}
            onOpenAttachment={openAttachment}
            onOpenSourceDetail={handleOpenSourceDetail}
          />
        )}
      </div>
      <DetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        source={activeDrawerSource}
        isEvent={selectedCase?.kind === 'event'}
        siblings={drawerSiblings}
        metaSources={metaSources}
        onUpdate={updateSource}
        onImportAttachment={importAttachment}
        onDeleteAttachment={deleteAttachment}
        onOpenAttachment={openAttachment}
        resolveAttachmentUrl={getAttachmentUrl}
        downloadMedia={downloadMedia}
        timestampAttachment={timestampAttachment}
        verifyTimestamp={verifyTimestamp}
        getTimestampStatus={getTimestampStatus}
      />
      <EntityDetailDrawer
        isOpen={selectedEntity !== null}
        onClose={() => setSelectedEntity(null)}
        entity={selectedEntity}
        qualities={[]}
        sources={sources.map(s => ({ id: s.id, title: s.title }))}
        onUpdateEntity={handleUpdateEntity}
        onDeleteEntity={handleDeleteEntity}
        onCreateQuality={handleCreateQuality}
        onUpdateQuality={handleUpdateQuality}
        onDeleteQuality={handleDeleteQuality}
        onAddQualitySourceRef={handleAddQualitySourceRef}
        onRemoveQualitySourceRef={handleRemoveQualitySourceRef}
      />
      {newContainerKind && (
        <NewContainerModal
          kind={newContainerKind}
          onClose={() => setNewContainerKind(null)}
          onSubmit={handleCreateContainer}
        />
      )}
    </div>
  );
}

export default App;
