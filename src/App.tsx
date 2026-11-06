import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { DetailDrawer } from './components/DetailDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { MetaSourcesPanel } from './components/MetaSourcesPanel';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import { useMetaSources } from './hooks/useMetaSources';
import type { SourceWithAttachments, ContainerKind } from './types';

function App() {
  const { cases, loading, createCase, updateCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
  const [newContainerKind, setNewContainerKind] = useState<ContainerKind | null>(null);
  // The meta source manager replaces the container view rather than opening a
  // modal, because it is a workspace-level list with its own table.
  const [showMetaSources, setShowMetaSources] = useState(false);

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

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setShowMetaSources(false);
    setDrawerOpen(false);
    setDrawerSource(null);
  };

  const handleOpenSourceDetail = (source: SourceWithAttachments) => {
    setDrawerSource(source);
    setDrawerOpen(true);
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

  // Keep the open drawer in sync with the latest source state.
  const activeDrawerSource = drawerSource
    ? sources.find(s => s.id === drawerSource.id) ?? drawerSource
    : null;

  // A source cannot reference itself, so the drawer offers the others.
  const drawerSiblings = activeDrawerSource
    ? sources.filter(s => s.id !== activeDrawerSource.id)
    : [];

  return (
    <div className="h-screen w-full flex bg-zinc-950">
      <Sidebar
        cases={cases}
        loading={loading}
        selectedCaseId={selectedCaseId}
        metaSourcesActive={showMetaSources}
        onSelectCase={handleSelectCase}
        onOpenMetaSources={() => {
          setShowMetaSources(true);
          setDrawerOpen(false);
          setDrawerSource(null);
        }}
        onCreateCase={() => setNewContainerKind('case')}
        onCreateEvent={() => setNewContainerKind('event')}
        onDeleteCase={handleDeleteCase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {showMetaSources ? (
          <MetaSourcesPanel
            metaSources={metaSources}
            loading={metaSourcesLoading}
            onCreate={createMetaSource}
            onUpdate={handleUpdateMetaSource}
            onDelete={handleDeleteMetaSource}
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
