import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import { api } from '../../../utils/api';
import { escapeRegExp } from '../utils/chatFormatting';
import type { Project } from '../../../types/app';

interface ProjectFileNode {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  children?: ProjectFileNode[];
}

export interface MentionableFile {
  name: string;
  path: string;
  relativePath?: string;
}

interface UseFileMentionsOptions {
  selectedProject: Project | null;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

const normalizeMentionPath = (rawPath: string) => {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return '';
  }
  return trimmedPath.startsWith('@') ? trimmedPath : `@${trimmedPath}`;
};

const flattenFileTree = (files: ProjectFileNode[], basePath = ''): MentionableFile[] => {
  let flattened: MentionableFile[] = [];

  files.forEach((file) => {
    const fullPath = basePath ? `${basePath}/${file.name}` : file.name;
    if (file.type === 'directory' && file.children) {
      flattened = flattened.concat(flattenFileTree(file.children, fullPath));
      return;
    }

    if (file.type === 'file') {
      flattened.push({
        name: file.name,
        path: fullPath,
        relativePath: file.path,
      });
    }
  });

  return flattened;
};

const getMatchingFiles = (fileList: MentionableFile[], query: string): MentionableFile[] => {
  const normalizedQuery = query.toLowerCase();
  return fileList
    .filter(
      (file) =>
        file.name.toLowerCase().includes(normalizedQuery) ||
        file.path.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 10);
};

export function useFileMentions({ selectedProject, input, setInput, textareaRef }: UseFileMentionsOptions) {
  const [fileList, setFileList] = useState<MentionableFile[]>([]);
  const [fileMentions, setFileMentions] = useState<string[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<MentionableFile[]>([]);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchProjectFiles = async () => {
      const projectName = selectedProject?.name;
      setFileList([]);
      setFilteredFiles([]);
      if (!projectName) {
        return;
      }

      try {
        const response = await api.getFiles(projectName, { signal: abortController.signal });
        if (!response.ok) {
          return;
        }

        const files = (await response.json()) as ProjectFileNode[];
        setFileList(flattenFileTree(files));
      } catch (error) {
        // Ignore aborts from rapid project switches; we only care about the latest request.
        if ((error as { name?: string })?.name === 'AbortError') {
          return;
        }
        console.error('Error fetching files:', error);
      }
    };

    fetchProjectFiles();
    return () => {
      abortController.abort();
    };
  }, [selectedProject?.name]);

  useEffect(() => {
    const textBeforeCursor = input.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      setShowFileDropdown(false);
      setAtSymbolPosition(-1);
      return;
    }

    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
    if (textAfterAt.includes(' ')) {
      setShowFileDropdown(false);
      setAtSymbolPosition(-1);
      return;
    }

    setAtSymbolPosition(lastAtIndex);
    setShowFileDropdown(true);
    setSelectedFileIndex(-1);
    setFilteredFiles(getMatchingFiles(fileList, textAfterAt));
  }, [input, cursorPosition, fileList]);

  const activeFileMentions = useMemo(() => {
    if (!input || fileMentions.length === 0) {
      return [];
    }
    return fileMentions.filter((path) => input.includes(path));
  }, [fileMentions, input]);

  const sortedFileMentions = useMemo(() => {
    if (activeFileMentions.length === 0) {
      return [];
    }
    const uniqueMentions = Array.from(new Set(activeFileMentions));
    return uniqueMentions.sort((mentionA, mentionB) => mentionB.length - mentionA.length);
  }, [activeFileMentions]);

  const fileMentionRegex = useMemo(() => {
    if (sortedFileMentions.length === 0) {
      return null;
    }
    const pattern = sortedFileMentions.map(escapeRegExp).join('|');
    return new RegExp(`(${pattern})`, 'g');
  }, [sortedFileMentions]);

  const fileMentionSet = useMemo(() => new Set(sortedFileMentions), [sortedFileMentions]);

  const renderInputWithMentions = useCallback(
    (text: string) => {
      if (!text) {
        return '';
      }
      if (!fileMentionRegex) {
        return text;
      }

      const parts = text.split(fileMentionRegex);
      return parts.map((part, index) =>
        fileMentionSet.has(part) ? (
          <span
            key={`mention-${index}`}
            className="bg-blue-200/70 -ml-0.5 dark:bg-blue-300/40 px-0.5 rounded-md box-decoration-clone text-transparent"
          >
            {part}
          </span>
        ) : (
          <span key={`text-${index}`}>{part}</span>
        ),
      );
    },
    [fileMentionRegex, fileMentionSet],
  );

  const selectFile = useCallback(
    (file: MentionableFile) => {
      const textBeforeAt = input.slice(0, atSymbolPosition);
      const textAfterAtQuery = input.slice(atSymbolPosition);
      const spaceIndex = textAfterAtQuery.indexOf(' ');
      const textAfterQuery = spaceIndex !== -1 ? textAfterAtQuery.slice(spaceIndex) : '';
      const mentionPath = normalizeMentionPath(file.path);

      const newInput = `${textBeforeAt}${mentionPath} ${textAfterQuery}`;
      const newCursorPosition = textBeforeAt.length + mentionPath.length + 1;

      if (textareaRef.current && !textareaRef.current.matches(':focus')) {
        textareaRef.current.focus();
      }

      setInput(newInput);
      setCursorPosition(newCursorPosition);
      setFileMentions((previousMentions) =>
        previousMentions.includes(mentionPath) ? previousMentions : [...previousMentions, mentionPath],
      );

      setShowFileDropdown(false);
      setAtSymbolPosition(-1);

      if (!textareaRef.current) {
        return;
      }

      requestAnimationFrame(() => {
        if (!textareaRef.current) {
          return;
        }
        textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        if (!textareaRef.current.matches(':focus')) {
          textareaRef.current.focus();
        }
      });
    },
    [input, atSymbolPosition, textareaRef, setInput],
  );

  const registerFileMentions = useCallback((mentions: string[]) => {
    if (!Array.isArray(mentions) || mentions.length === 0) {
      return;
    }

    const normalizedMentions = mentions
      .map(normalizeMentionPath)
      .filter(Boolean);

    if (normalizedMentions.length === 0) {
      return;
    }

    setFileMentions((previousMentions) => {
      const mergedMentions = new Set(previousMentions);
      normalizedMentions.forEach((mention) => mergedMentions.add(mention));
      return Array.from(mergedMentions);
    });
  }, []);

  const handleFileMentionsKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!showFileDropdown || filteredFiles.length === 0) {
        return false;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedFileIndex((previousIndex) =>
          previousIndex < filteredFiles.length - 1 ? previousIndex + 1 : 0,
        );
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedFileIndex((previousIndex) =>
          previousIndex > 0 ? previousIndex - 1 : filteredFiles.length - 1,
        );
        return true;
      }

      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (selectedFileIndex >= 0) {
          selectFile(filteredFiles[selectedFileIndex]);
        } else if (filteredFiles.length > 0) {
          selectFile(filteredFiles[0]);
        }
        return true;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setShowFileDropdown(false);
        return true;
      }

      return false;
    },
    [showFileDropdown, filteredFiles, selectedFileIndex, selectFile],
  );

  return {
    showFileDropdown,
    filteredFiles,
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    registerFileMentions,
    setCursorPosition,
    handleFileMentionsKeyDown,
  };
}
