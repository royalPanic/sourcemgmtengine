import { useState } from 'react';
import { qualitiesApi, qualitySourceRefsApi } from './api/tauri';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { DetailDrawer } from './components/DetailDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { EntitiesPanel } from './components/EntitiesPanel';
import { EntityDetailDrawer } from './components/EntityDetailDrawer';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import { useEntities } from './hooks/useEntities';
import { useEntityTypes } from './hooks/useEntityTypes';
import { useEntityQualities } from './hooks/useEntities';
import type { SourceWithAttachments, Entity } from './types';

function App() {
  const { cases, loading, createCase, updateCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
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
  } = useSources(selectedCaseId);

  // One list serves every view (workspace tabs, source reference picker, and
  // the Entities panel), so it is always fetched with the container scope and
  // no `is_global` filter. That returns the global entities *plus* this
  // container's own entities, which is what all three consumers want. Forcing
  // `is_global` here would hide case-specific entities from every view except
  // the panel.
  const {
    entities,
    loading: entitiesLoading,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useEntities(selectedCaseId);

  const { qualities: entityQualities, loadQualities: reloadQualities } = useEntityQualities(selectedEntity?.id ?? null);

  const {
    types: entityTypes,
    loading: entityTypesLoading,
  } = useEntityTypes();

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
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
    setShowEntities(false);
    setShowNewContainer(false);
  };

  const handleDeleteCase = async (caseId: string) => {
    await deleteCase(caseId);
    if (selectedCaseId === caseId) {
      setSelectedCaseId(null);
    }
  };

  const handleCreateEntity = async (params: {
    entityType: string;
    name: string;
    description?: string;
    caseId?: string;
    isGlobal: boolean;
  }): Promise<void> => {
    await createEntity(params);
    // Stay where the operator was. Switching views on create hid the new
    // case-specific entity immediately after it was added.
  };

  const handleUpdateEntity = async (id: string, params: Partial<{
    name: string;
    description: string;
    caseId: string;
    isGlobal: boolean;
  }>) => {
    const updated = await updateEntity(id, params);
    setSelectedEntity(updated);
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
    await reloadQualities();
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
    await reloadQualities();
  };

  const handleDeleteQuality = async (id: string) => {
    await qualitiesApi.delete(id);
    await reloadQualities();
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

  const view = showEntities ? 'entities' : 'content';

  return (
    <div className="h-screen w-full flex bg-zinc-950">
      <Sidebar
        cases={cases}
        loading={loading}
        selectedCaseId={selectedCaseId}
        entitiesActive={showEntities}
        onSelectCase={handleSelectCase}
        onOpenEntities={() => {
          setShowEntities(true);
          setDrawerOpen(false);
          setDrawerSource(null);
          setSelectedEntity(null);
        }}
        onCreateCase={() => setShowNewContainer(true)}
        onDeleteCase={handleDeleteCase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === 'entities' ? (
          <EntitiesPanel
            selectedCaseId={selectedCaseId}
            cases={cases}
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
            cases={cases}
            sources={sources}
            sourcesLoading={sourcesLoading}
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
        entities={entities}
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
        cases={cases}
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
