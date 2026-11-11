import { useState } from 'react';
import { qualitiesApi, qualitySourceRefsApi } from './api/tauri';
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
import { useEntityQualities } from './hooks/useEntities';
import type { SourceWithAttachments, Entity } from './types';

function App() {
  const { cases, loading, createCase, updateCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
  // The meta source manager replaces the container view rather than opening a
  // modal, because it is a workspace-level list with its own table.
  const [showMetaSources, setShowMetaSources] = useState(false);
  // The entities panel replaces the container view.
  const [showEntities, setShowEntities] = useState(false);
  const [showNewContainer, setShowNewContainer] = useState(false);
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

  const { qualities: entityQualities, loadQualities: reloadQualities } = useEntityQualities(selectedEntity?.id ?? null);

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
    eventDate?: string;
    eventTime?: string;
  }) => {
    const created = await createCase(params);
    setSelectedCaseId(created.id);
    setShowMetaSources(false);
    setShowEntities(false);
  };

  const handleDeleteCase = async (caseId: string) => {
    await deleteCase(caseId);
    if (selectedCaseId === caseId) {
      setSelectedCaseId(null);
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

  const handleCreateQuality = async (params: {
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
    await qualitiesApi.create({
      entityId: params.entityId,
      qualityName: params.qualityName,
      qualityType: params.qualityType as import('./types').QualityType,
      valueString: params.valueString ?? undefined,
      valueInteger: params.valueInteger ?? undefined,
      valueBoolean: params.valueBoolean ?? undefined,
      valueDate: params.valueDate ?? undefined,
      valueCoordinates: params.valueCoordinates ?? undefined,
      valueAddress: params.valueAddress ?? undefined,
    });
  };

  const handleUpdateQuality = async (id: string, params: Partial<{
    qualityName: string;
    qualityType: string;
    valueString: string | null;
    valueInteger: number | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueCoordinates: string | null;
    valueAddress: string | null;
  }>) => {
    await qualitiesApi.update(id, {
      qualityName: params.qualityName ?? undefined,
      qualityType: params.qualityType as import('./types').QualityType | undefined,
      valueString: params.valueString ?? undefined,
      valueInteger: params.valueInteger ?? undefined,
      valueBoolean: params.valueBoolean ?? undefined,
      valueDate: params.valueDate ?? undefined,
      valueCoordinates: params.valueCoordinates ?? undefined,
      valueAddress: params.valueAddress ?? undefined,
    });
  };

  const handleDeleteQuality = async (id: string) => {
    await qualitiesApi.delete(id);
  };

  const handleAddQualitySourceRef = async (params: {
    qualityId: string;
    sourceId: string;
    reliabilityCode?: string;
    credibilityCode?: number;
  }) => {
    await qualitySourceRefsApi.add({
      qualityId: params.qualityId,
      sourceId: params.sourceId,
      reliabilityCode: params.reliabilityCode as import('./types').ReliabilityCode | undefined,
      credibilityCode: params.credibilityCode as import('./types').CredibilityCode | undefined,
    });
    await reloadQualities();
  };

  const handleRemoveQualitySourceRef = async (refId: string) => {
    await qualitySourceRefsApi.remove(refId);
    await reloadQualities();
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
        onCreateCase={() => setShowNewContainer(true)}
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
            selectedCaseId={selectedCaseId}
            entities={entities}
            entityTypes={entityTypes}
            loading={entitiesLoading || entityTypesLoading}
            onCreateEntity={handleCreateEntity}
            onDeleteEntity={handleDeleteEntity}
            onOpenEntityDetail={handleOpenEntityDetail}
          />
        ) : (
          <MainContent
            container={selectedCase}
            sources={sources}
            sourcesLoading={sourcesLoading}
            metaSources={metaSources}
            metaSourcesLoading={metaSourcesLoading}
            entities={entities}
            entitiesLoading={entitiesLoading || entityTypesLoading}
            entityTypes={entityTypes}
            onUpdateContainer={updateCase}
            onCreateSource={createSource}
            onUpdateSource={updateSource}
            onDeleteSource={deleteSource}
            onImportAttachment={importAttachment}
            onDeleteAttachment={deleteAttachment}
            onOpenAttachment={openAttachment}
            onOpenSourceDetail={handleOpenSourceDetail}
            onCreateMetaSource={createMetaSource}
            onUpdateMetaSource={handleUpdateMetaSource}
            onDeleteMetaSource={handleDeleteMetaSource}
            onCreateEntity={handleCreateEntity}
            onDeleteEntity={handleDeleteEntity}
            onOpenEntityDetail={handleOpenEntityDetail}
          />
        )}
      </div>
      <DetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        source={activeDrawerSource}
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
        qualities={entityQualities}
        sources={sources.map(s => ({ id: s.id, title: s.title }))}
        onUpdateEntity={handleUpdateEntity}
        onDeleteEntity={handleDeleteEntity}
        onCreateQuality={handleCreateQuality}
        onUpdateQuality={handleUpdateQuality}
        onDeleteQuality={handleDeleteQuality}
        onAddQualitySourceRef={handleAddQualitySourceRef}
        onRemoveQualitySourceRef={handleRemoveQualitySourceRef}
      />
      {showNewContainer && (
        <NewContainerModal
          onClose={() => setShowNewContainer(false)}
          onSubmit={handleCreateContainer}
        />
      )}
    </div>
  );
}

export default App;
