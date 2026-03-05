import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Project } from '../../../types/app';
import type { CodeEditorDiffInfo, CodeEditorFile } from '../types/types';

type UseEditorSidebarOptions = {
  selectedProject: Project | null;
  isMobile: boolean;
  initialWidth?: number;
};

const resolveNextActiveFileId = (
  currentActiveId: string | null,
  closingFileId: string,
  nextFiles: CodeEditorFile[],
  closingIndex: number,
) => {
  if (currentActiveId !== closingFileId) {
    if (currentActiveId && nextFiles.some((file) => file.id === currentActiveId)) {
      return currentActiveId;
    }
    return nextFiles[0]?.id ?? null;
  }

  if (nextFiles.length === 0) {
    return null;
  }

  const fallbackIndex = closingIndex >= nextFiles.length ? nextFiles.length - 1 : closingIndex;
  return nextFiles[fallbackIndex]?.id ?? null;
};

export const useEditorSidebar = ({
  selectedProject,
  isMobile,
  initialWidth = 600,
}: UseEditorSidebarOptions) => {
  const [openFiles, setOpenFiles] = useState<CodeEditorFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [dirtyFileIds, setDirtyFileIds] = useState<Record<string, boolean>>({});
  const [editorWidth, setEditorWidth] = useState(initialWidth);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hasManualWidth, setHasManualWidth] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const saveHandlersRef = useRef<Record<string, () => Promise<boolean>>>({});

  const buildFileId = useCallback(
    (filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const projectKey = selectedProject?.name ?? 'project';
      return `${projectKey}:${normalizedPath}`;
    },
    [selectedProject?.name],
  );

  const maybeSaveUnsavedFile = useCallback(
    async (fileId: string, actionLabel: 'switch' | 'close') => {
      if (!dirtyFileIds[fileId]) {
        return true;
      }

      const shouldSave = window.confirm(
        actionLabel === 'switch'
          ? 'Current file has unsaved changes. Save before switching tabs?\nClick "Cancel" to switch without saving.'
          : 'Current file has unsaved changes. Save before closing this tab?\nClick "Cancel" to close without saving.',
      );

      if (!shouldSave) {
        return true;
      }

      const saveHandler = saveHandlersRef.current[fileId];
      if (!saveHandler) {
        return true;
      }

      const saveSucceeded = await saveHandler();
      if (saveSucceeded) {
        return true;
      }

      return window.confirm('Save failed. Continue anyway?');
    },
    [dirtyFileIds],
  );

  const handleFileOpen = useCallback(
    (filePath: string, diffInfo: CodeEditorDiffInfo | null = null) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || filePath;
      const fileId = buildFileId(filePath);

      const nextFile: CodeEditorFile = {
        id: fileId,
        name: fileName,
        path: filePath,
        projectName: selectedProject?.name,
        diffInfo,
      };

      setOpenFiles((previous) => {
        const existingIndex = previous.findIndex((file) => file.id === fileId);
        if (existingIndex === -1) {
          return [...previous, nextFile];
        }

        const existingFile = previous[existingIndex];
        if (!diffInfo || existingFile.diffInfo) {
          return previous;
        }

        const nextFiles = [...previous];
        nextFiles[existingIndex] = { ...existingFile, diffInfo };
        return nextFiles;
      });
      setActiveFileId(fileId);
    },
    [buildFileId, selectedProject?.name],
  );

  const handleActivateFile = useCallback(
    async (fileId: string) => {
      if (fileId === activeFileId) {
        return;
      }

      if (activeFileId) {
        const canSwitch = await maybeSaveUnsavedFile(activeFileId, 'switch');
        if (!canSwitch) {
          return;
        }
      }

      setActiveFileId(fileId);
    },
    [activeFileId, maybeSaveUnsavedFile],
  );

  const handleCloseFile = useCallback(
    async (fileId: string) => {
      const canClose = await maybeSaveUnsavedFile(fileId, 'close');
      if (!canClose) {
        return;
      }

      setOpenFiles((previous) => {
        const closingIndex = previous.findIndex((file) => file.id === fileId);
        if (closingIndex === -1) {
          return previous;
        }

        const nextFiles = previous.filter((file) => file.id !== fileId);

        setActiveFileId((currentActiveId) => {
          return resolveNextActiveFileId(currentActiveId, fileId, nextFiles, closingIndex);
        });

        return nextFiles;
      });

      setDirtyFileIds((previous) => {
        if (!(fileId in previous)) {
          return previous;
        }

        const nextDirtyFileIds = { ...previous };
        delete nextDirtyFileIds[fileId];
        return nextDirtyFileIds;
      });
      delete saveHandlersRef.current[fileId];
    },
    [maybeSaveUnsavedFile],
  );

  const handleCloseEditor = useCallback(() => {
    if (!activeFileId) {
      setEditorExpanded(false);
      return;
    }

    void handleCloseFile(activeFileId);
  }, [activeFileId, handleCloseFile]);

  const handleDirtyStateChange = useCallback((fileId: string, isDirty: boolean) => {
    setDirtyFileIds((previous) => {
      if (!isDirty) {
        if (!(fileId in previous)) {
          return previous;
        }

        const nextDirtyFileIds = { ...previous };
        delete nextDirtyFileIds[fileId];
        return nextDirtyFileIds;
      }

      if (previous[fileId]) {
        return previous;
      }

      return {
        ...previous,
        [fileId]: true,
      };
    });
  }, []);

  const registerSaveHandler = useCallback((fileId: string, handler: (() => Promise<boolean>) | null) => {
    if (!handler) {
      delete saveHandlersRef.current[fileId];
      return;
    }

    saveHandlersRef.current[fileId] = handler;
  }, []);

  const handleToggleEditorExpand = useCallback(() => {
    setEditorExpanded((previous) => !previous);
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isMobile) {
        return;
      }

      // After first drag interaction, the editor width is user-controlled.
      setHasManualWidth(true);
      setIsResizing(true);
      event.preventDefault();
    },
    [isMobile],
  );

  useEffect(() => {
    if (openFiles.length > 0) {
      return;
    }

    setEditorExpanded(false);
  }, [openFiles.length]);

  const editingFile = useMemo(() => (
    openFiles.find((file) => file.id === activeFileId) ?? null
  ), [activeFileId, openFiles]);

  useEffect(() => {
    if (!activeFileId) {
      return;
    }

    if (openFiles.some((file) => file.id === activeFileId)) {
      return;
    }

    setActiveFileId(openFiles[0]?.id ?? null);
  }, [activeFileId, openFiles]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!isResizing) {
        return;
      }

      // Get the main container (parent of EditorSidebar's parent) that contains both left content and editor
      const editorContainer = resizeHandleRef.current?.parentElement;
      const mainContainer = editorContainer?.parentElement;
      if (!mainContainer) {
        return;
      }

      const containerRect = mainContainer.getBoundingClientRect();
      // Calculate new editor width: distance from mouse to right edge of main container
      const newWidth = containerRect.right - event.clientX;

      const minWidth = 300;
      const maxWidth = containerRect.width * 0.8;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setEditorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return {
    openFiles,
    activeFileId,
    dirtyFileIds,
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleActivateFile,
    handleCloseFile,
    handleCloseEditor,
    handleDirtyStateChange,
    registerSaveHandler,
    handleToggleEditorExpand,
    handleResizeStart,
  };
};
