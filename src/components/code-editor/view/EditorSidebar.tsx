import { useState } from 'react';
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
    <>
      {!editorExpanded && (
        <div
          ref={resizeHandleRef}
          onMouseDown={onResizeStart}
          className="flex-shrink-0 w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors relative group"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-blue-500 dark:bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      <div
        className={`flex-shrink-0 border-l border-gray-200 dark:border-gray-700 h-full overflow-hidden ${useFlexLayout ? 'flex-1' : ''}`}
        style={useFlexLayout ? undefined : { width: `${editorWidth}px` }}
      >
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 px-2 py-1 bg-gray-50 dark:bg-gray-900/40">
          {openFiles.map((file) => {
            const fileId = file.id ?? `${file.projectName ?? 'project'}:${file.path}`;
            const isActive = fileId === activeFileId;
            const isDirty = Boolean(dirtyFileIds[fileId]);

            return (
              <div
                key={fileId}
                className={`flex items-center rounded-md border min-w-0 ${
                  isActive
                    ? 'border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800'
                    : 'border-transparent bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => { void onActivateFile(fileId); }}
                  className="px-2 py-1 text-xs text-left text-gray-700 dark:text-gray-200 max-w-[170px] truncate"
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
                  className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 rounded"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
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
    </>
  );
}
