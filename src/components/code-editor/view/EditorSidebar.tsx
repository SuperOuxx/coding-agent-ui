import { useState, useEffect, useRef } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import { X } from 'lucide-react';
import type { CodeEditorFile } from '../types/types';
import CodeEditor from './CodeEditor';

type EditorSidebarProps = {
  openFiles: CodeEditorFile[];
  activeFileId: string | null;
  dirtyFileIds: Record<string, boolean>;
  editingFile: CodeEditorFile | null;
  isMobile: boolean;
  editorExpanded: boolean;
  editorWidth: number;
  hasManualWidth: boolean;
  resizeHandleRef: MutableRefObject<HTMLDivElement | null>;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onActivateFile: (fileId: string) => Promise<void>;
  onCloseFile: (fileId: string) => Promise<void>;
  onCloseEditor: () => void;
  onDirtyStateChange: (fileId: string, isDirty: boolean) => void;
  onRegisterSaveHandler: (fileId: string, handler: (() => Promise<boolean>) | null) => void;
  onToggleEditorExpand: () => void;
  projectPath?: string;
  fillSpace?: boolean;
};

// Minimum width for the left content (file tree, chat, etc.)
const MIN_LEFT_CONTENT_WIDTH = 200;
// Minimum width for the editor sidebar
const MIN_EDITOR_WIDTH = 280;

export default function EditorSidebar({
  openFiles,
  activeFileId,
  dirtyFileIds,
  editingFile,
  isMobile,
  editorExpanded,
  editorWidth,
  hasManualWidth,
  resizeHandleRef,
  onResizeStart,
  onActivateFile,
  onCloseFile,
  onCloseEditor,
  onDirtyStateChange,
  onRegisterSaveHandler,
  onToggleEditorExpand,
  projectPath,
  fillSpace,
}: EditorSidebarProps) {
  const [poppedOut, setPoppedOut] = useState(false);
  const currentFileId = editingFile?.id;
  const handleActiveFileDirtyStateChange = currentFileId
    ? (isDirty: boolean) => onDirtyStateChange(currentFileId, isDirty)
    : null;
  const handleActiveFileSaveHandlerRegistration = currentFileId
    ? (handler: (() => Promise<boolean>) | null) => onRegisterSaveHandler(currentFileId, handler)
    : null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [effectiveWidth, setEffectiveWidth] = useState(editorWidth);

  // Adjust editor width when container size changes to ensure buttons are always visible
  useEffect(() => {
    if (!editingFile || isMobile || poppedOut) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      const parentElement = containerRef.current.parentElement;
      if (!parentElement) return;

      const containerWidth = parentElement.clientWidth;

      // Calculate maximum allowed editor width
      const maxEditorWidth = containerWidth - MIN_LEFT_CONTENT_WIDTH;

      if (maxEditorWidth < MIN_EDITOR_WIDTH) {
        // Not enough space - pop out the editor so user can still see everything
        setPoppedOut(true);
      } else if (editorWidth > maxEditorWidth) {
        // Editor is too wide - constrain it to ensure left content has space
        setEffectiveWidth(maxEditorWidth);
      } else {
        setEffectiveWidth(editorWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    // Also use ResizeObserver for more accurate detection
    const resizeObserver = new ResizeObserver(updateWidth);
    const parentEl = containerRef.current?.parentElement;
    if (parentEl) {
      resizeObserver.observe(parentEl);
    }

    return () => {
      window.removeEventListener('resize', updateWidth);
      resizeObserver.disconnect();
    };
  }, [editingFile, isMobile, poppedOut, editorWidth]);

  if (!editingFile) {
    return null;
  }

  if (isMobile || poppedOut) {
    return (
      <CodeEditor
        file={editingFile}
        onClose={() => {
          setPoppedOut(false);
          onCloseEditor();
        }}
        projectPath={projectPath}
        isSidebar={false}
        onDirtyStateChange={handleActiveFileDirtyStateChange}
        onRegisterSaveHandler={handleActiveFileSaveHandlerRegistration}
      />
    );
  }

  // In files tab, fill the remaining width unless user has dragged manually.
  const useFlexLayout = editorExpanded || (fillSpace && !hasManualWidth);

  return (
    <div ref={containerRef} className={`flex h-full min-w-0 flex-shrink-0 ${editorExpanded ? 'flex-1' : ''}`}>
      {!editorExpanded && (
        <div
          ref={resizeHandleRef}
          onMouseDown={onResizeStart}
          className="group relative w-1 flex-shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-500 dark:bg-gray-700 dark:hover:bg-blue-600"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-blue-500 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-blue-600" />
        </div>
      )}

      <div
        className={`h-full overflow-hidden border-l border-gray-200 dark:border-gray-700 ${useFlexLayout ? 'min-w-0 flex-1' : `min-w-[ flex-shrink-0${MIN_EDITOR_WIDTH}px]`}`}
        style={useFlexLayout ? undefined : { width: `${effectiveWidth}px`, minWidth: `${MIN_EDITOR_WIDTH}px` }}
      >
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-900/40">
          {openFiles.map((file) => {
            const fileId = file.id ?? `${file.projectName ?? 'project'}:${file.path}`;
            const isActive = fileId === activeFileId;
            const isDirty = Boolean(dirtyFileIds[fileId]);

            return (
              <div
                key={fileId}
                className={`flex min-w-0 items-center rounded-md border ${isActive
                    ? 'border-blue-300 bg-white dark:border-blue-700 dark:bg-gray-800'
                    : 'border-transparent bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/60'
                  }`}
              >
                <button
                  type="button"
                  onClick={() => { void onActivateFile(fileId); }}
                  className="max-w-[170px] truncate px-2 py-1 text-left text-xs text-gray-700 dark:text-gray-200"
                  title={file.path}
                >
                  {file.name}
                  {isDirty && <span className="ml-1 text-amber-500">●</span>}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onCloseFile(fileId);
                  }}
                  className="rounded p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                  title="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <CodeEditor
          key={currentFileId ?? editingFile.path}
          file={editingFile}
          onClose={onCloseEditor}
          projectPath={projectPath}
          isSidebar
          isExpanded={editorExpanded}
          onToggleExpand={onToggleEditorExpand}
          onPopOut={() => setPoppedOut(true)}
          onDirtyStateChange={handleActiveFileDirtyStateChange}
          onRegisterSaveHandler={handleActiveFileSaveHandlerRegistration}
        />
      </div>
    </div>
  );
}
