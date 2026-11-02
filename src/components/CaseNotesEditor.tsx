import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useAutoSave } from '../hooks/useDebounce';

interface CaseNotesEditorProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  loading: boolean;
  saving: boolean;
}

export function CaseNotesEditor({ content, onSave, loading, saving }: CaseNotesEditorProps) {
  const lastSavedRef = useRef(content);

  const debouncedSave = useAutoSave<string>(async (html) => {
    await onSave(html);
    lastSavedRef.current = html;
  }, 800);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Placeholder.configure({
        placeholder: 'Start writing case notes…',
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Underline,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose-editor focus:outline-none min-h-full px-8 py-6 text-zinc-100',
      },
    },
    onUpdate: ({ editor: instance }) => {
      debouncedSave(instance.getHTML());
    },
  });

  // Adopt externally loaded content (e.g. after the note finishes loading).
  useEffect(() => {
    if (!editor || loading) return;
    if (content === lastSavedRef.current) return;
    if (editor.getHTML() === content) {
      lastSavedRef.current = content;
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
    lastSavedRef.current = content;
  }, [content, editor, loading]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center gap-2">
        {saving ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Saving…
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            All changes saved
          </>
        )}
      </div>
    </div>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const buttonClass = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-medium transition-colors ${
      active ? 'bg-amber-600/20 text-amber-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
      <button type="button" className={buttonClass(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <strong>B</strong>
      </button>
      <button type="button" className={buttonClass(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <em>I</em>
      </button>
      <button type="button" className={buttonClass(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
        <span className="underline">U</span>
      </button>
      <button type="button" className={buttonClass(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <span className="line-through">S</span>
      </button>
      <button type="button" className={buttonClass(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
        H
      </button>

      <span className="w-px h-5 bg-zinc-700 mx-1" />

      <button type="button" className={buttonClass(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
        H1
      </button>
      <button type="button" className={buttonClass(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
        H2
      </button>
      <button type="button" className={buttonClass(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
        H3
      </button>

      <span className="w-px h-5 bg-zinc-700 mx-1" />

      <button type="button" className={buttonClass(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        • List
      </button>
      <button type="button" className={buttonClass(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        1. List
      </button>
      <button type="button" className={buttonClass(editor.isActive('taskList'))} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">
        ☑ List
      </button>
      <button type="button" className={buttonClass(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
        ❝
      </button>
      <button type="button" className={buttonClass(editor.isActive('codeBlock'))} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
        {'</>'}
      </button>

      <span className="w-px h-5 bg-zinc-700 mx-1" />

      <button type="button" className={buttonClass(false)} onClick={() => editor.chain().focus().undo().run()} title="Undo">
        ↶
      </button>
      <button type="button" className={buttonClass(false)} onClick={() => editor.chain().focus().redo().run()} title="Redo">
        ↷
      </button>
    </div>
  );
}
