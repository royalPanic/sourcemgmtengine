import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { DetailDrawer } from './components/DetailDrawer';
import { useCases } from './hooks/useCases';
import { useSources } from './hooks/useSources';
import type { SourceWithAttachments } from './types';

function App() {
  const { cases, loading, createCase, deleteCase } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceWithAttachments | null>(null);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);

  const {
    sources,
    loading: sourcesLoading,
    createSource,
    updateSource,
    deleteSource,
    addAttachment,
    deleteAttachment,
    openAttachment,
  } = useSources(selectedCaseId);

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setDrawerOpen(false);
    setDrawerSource(null);
  };

  const handleOpenSourceDetail = (source: SourceWithAttachments) => {
    setDrawerSource(source);
    setDrawerOpen(true);
  };

  const handleCreateCase = async (title: string, description?: string) => {
    const newCase = await createCase(title, description);
    setSelectedCaseId(newCase.id);
    setShowNewCaseModal(false);
  };

  const handleDeleteCase = async (caseId: string) => {
    if (window.confirm('Are you sure you want to delete this case? This will also delete all associated sources and notes.')) {
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
        onCreateCase={() => setShowNewCaseModal(true)}
        onDeleteCase={handleDeleteCase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MainContent
          caseId={selectedCaseId}
          sources={sources}
          sourcesLoading={sourcesLoading}
          onCreateSource={createSource}
          onUpdateSource={updateSource}
          onDeleteSource={deleteSource}
          onAddAttachment={addAttachment}
          onDeleteAttachment={deleteAttachment}
          onOpenAttachment={openAttachment}
          onOpenSourceDetail={handleOpenSourceDetail}
        />
      </div>
      <DetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        source={activeDrawerSource}
        onUpdate={updateSource}
        onAddAttachment={addAttachment}
        onDeleteAttachment={deleteAttachment}
        onOpenAttachment={openAttachment}
      />
      {showNewCaseModal && (
        <NewCaseModal
          onClose={() => setShowNewCaseModal(false)}
          onSubmit={handleCreateCase}
        />
      )}
    </div>
  );
}

function NewCaseModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (title: string, description?: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(title.trim(), description.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 card p-6">
        <h2 className="text-xl font-semibold mb-4">Create New Case</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Enter case title"
              autoFocus
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea min-h-[80px]"
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim()}>
              {submitting ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;