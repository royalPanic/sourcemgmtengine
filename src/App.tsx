import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { DetailDrawer } from './components/DetailDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import type { SourceWithAttachments, ContainerKind } from './types';

function App() {
  const { cases, loading, createCase, updateCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
  const [newContainerKind, setNewContainerKind] = useState<ContainerKind | null>(null);

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
  } = useSources(selectedCaseId);

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
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

  // Keep the open drawer in sync with the latest source state.
  const activeDrawerSource = drawerSource
    ? sources.find(s => s.id === drawerSource.id) ?? drawerSource
    : null;

  return (
    <div className="h-screen w-full flex bg-zinc-950">
      <Sidebar
        cases={cases}
        loading={loading}
        selectedCaseId={selectedCaseId}
        onSelectCase={handleSelectCase}
        onCreateCase={() => setNewContainerKind('case')}
        onCreateEvent={() => setNewContainerKind('event')}
        onDeleteCase={handleDeleteCase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MainContent
          container={selectedCase}
          sources={sources}
          sourcesLoading={sourcesLoading}
          onUpdateContainer={updateCase}
          onCreateSource={createSource}
          onUpdateSource={updateSource}
          onDeleteSource={deleteSource}
          onImportAttachment={importAttachment}
          onDeleteAttachment={deleteAttachment}
          onOpenAttachment={openAttachment}
          onOpenSourceDetail={handleOpenSourceDetail}
        />
      </div>
      <DetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        source={activeDrawerSource}
        isEvent={selectedCase?.kind === 'event'}
        onUpdate={updateSource}
        onImportAttachment={importAttachment}
        onDeleteAttachment={deleteAttachment}
        onOpenAttachment={openAttachment}
        resolveAttachmentUrl={getAttachmentUrl}
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