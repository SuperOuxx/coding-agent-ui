import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  FormEvent,
  SetStateAction,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { api, authenticatedFetch } from '../../../utils/api';
import { thinkingModes } from '../constants/thinkingModes';
import { grantClaudeToolPermission } from '../utils/chatPermissions';
import { safeLocalStorage } from '../utils/chatStorage';
import type {
  ChatMessage,
  PendingPermissionRequest,
  PermissionMode,
} from '../types/types';
import type { Project, ProjectSession, SessionProvider } from '../../../types/app';
import { escapeRegExp } from '../utils/chatFormatting';
import { useFileMentions } from './useFileMentions';
import { type SlashCommand, useSlashCommands } from './useSlashCommands';

type PendingViewSession = {
  sessionId: string | null;
  startedAt: number;
};

interface UseChatComposerStateArgs {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: SessionProvider;
  permissionMode: PermissionMode | string;
  cyclePermissionMode: () => void;
  cursorModel: string;
  claudeModel: string;
  codexModel: string;
  geminiModel: string;
  isLoading: boolean;
  canAbortSession: boolean;
  tokenBudget: Record<string, unknown> | null;
  sendMessage: (message: unknown) => boolean;
  sendByCtrlEnter?: boolean;
  onSessionActive?: (sessionId?: string | null) => void;
  onSessionProcessing?: (sessionId?: string | null) => void;
  onInputFocusChange?: (focused: boolean) => void;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onShowSettings?: () => void;
  pendingViewSessionRef: { current: PendingViewSession | null };
  scrollToBottom: () => void;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessionMessages?: Dispatch<SetStateAction<any[]>>;
  setIsLoading: (loading: boolean) => void;
  setCanAbortSession: (canAbort: boolean) => void;
  setClaudeStatus: (status: { text: string; tokens: number; can_interrupt: boolean } | null) => void;
  setIsUserScrolledUp: (isScrolledUp: boolean) => void;
  setPendingPermissionRequests: Dispatch<SetStateAction<PendingPermissionRequest[]>>;
}

interface MentionableFile {
  name: string;
  path: string;
}

interface CommandExecutionResult {
  type: 'builtin' | 'custom';
  action?: string;
  data?: any;
  content?: string;
  hasBashCommands?: boolean;
  hasFileIncludes?: boolean;
}

interface SkillOption {
  name: string;
  value: string;
  source: 'global' | 'project';
}

interface SkillsApiResponse {
  skills?: unknown;
}

const SKILL_ENABLED_PROVIDERS = new Set<SessionProvider>(['claude', 'codex']);
const SKILL_PREFIX_PATTERN = /^[/$]\S+\s*/;

function isSkillEnabledProvider(provider: SessionProvider): boolean {
  return SKILL_ENABLED_PROVIDERS.has(provider);
}

function getProjectPath(project: Project | null): string {
  if (!project) {
    return '';
  }
  return project.fullPath || project.path || '';
}

function getSkillPrefix(provider: SessionProvider, skillValue: string): string {
  if (provider === 'claude') {
    return `/${skillValue} `;
  }
  return `$${skillValue} `;
}

function stripLeadingSkillPrefix(value: string): string {
  return value.replace(SKILL_PREFIX_PATTERN, '');
}

function normalizeSkillOption(skill: unknown): SkillOption | null {
  if (!skill || typeof skill !== 'object') {
    return null;
  }

  const value = typeof (skill as { value?: unknown }).value === 'string'
    ? (skill as { value: string }).value.trim()
    : '';
  if (!value) {
    return null;
  }

  const rawName = (skill as { name?: unknown }).name;
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : value;
  const source: SkillOption['source'] = (skill as { source?: unknown }).source === 'project'
    ? 'project'
    : 'global';

  return { name, value, source };
}

function buildSkillsEndpoint(provider: SessionProvider, projectPath: string): string {
  const searchParams = new URLSearchParams({ provider });
  if (projectPath) {
    searchParams.set('projectPath', projectPath);
  }
  return `/api/skills?${searchParams.toString()}`;
}

const createFakeSubmitEvent = () => {
  return { preventDefault: () => undefined } as unknown as FormEvent<HTMLFormElement>;
};

const isTemporarySessionId = (sessionId: string | null | undefined) =>
  Boolean(sessionId && sessionId.startsWith('new-session-'));

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const ATTACHMENT_SIZE_ERROR = 'File too large (max 50MB)';

const normalizeUploadedReference = (reference: unknown): string => {
  if (typeof reference !== 'string') {
    return '';
  }

  const trimmedReference = reference.trim();
  if (!trimmedReference) {
    return '';
  }

  return trimmedReference.startsWith('@') ? trimmedReference : `@${trimmedReference}`;
};

const appendReferencesToMessage = (baseMessage: string, references: string[]): string => {
  if (references.length === 0) {
    return baseMessage;
  }

  const referencesText = references.join(' ');
  return baseMessage.trim() ? `${baseMessage}\n${referencesText}` : referencesText;
};

export function useChatComposerState({
  selectedProject,
  selectedSession,
  currentSessionId,
  provider,
  permissionMode,
  cyclePermissionMode,
  cursorModel,
  claudeModel,
  codexModel,
  geminiModel,
  isLoading,
  canAbortSession,
  tokenBudget,
  sendMessage,
  sendByCtrlEnter,
  onSessionActive,
  onSessionProcessing,
  onInputFocusChange,
  onFileOpen,
  onShowSettings,
  pendingViewSessionRef,
  scrollToBottom,
  setChatMessages,
  setSessionMessages,
  setIsLoading,
  setCanAbortSession,
  setClaudeStatus,
  setIsUserScrolledUp,
  setPendingPermissionRequests,
}: UseChatComposerStateArgs) {
  const [input, setInput] = useState(() => {
    if (typeof window !== 'undefined' && selectedProject) {
      return safeLocalStorage.getItem(`draft_input_${selectedProject.name}`) || '';
    }
    return '';
  });
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [fileErrors, setFileErrors] = useState<Map<string, string>>(new Map());
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [thinkingMode, setThinkingMode] = useState('none');
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputHighlightRef = useRef<HTMLDivElement>(null);
  const handleSubmitRef = useRef<
    ((event: any) => Promise<void>) | null
  >(null);
  const inputValueRef = useRef(input);

  const handleBuiltInCommand = useCallback(
    (result: CommandExecutionResult) => {
      const { action, data } = result;
      switch (action) {
        case 'clear':
          setChatMessages([]);
          setSessionMessages?.([]);
          break;

        case 'help':
          setChatMessages((previous) => [
            ...previous,
            {
              type: 'assistant',
              content: data.content,
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'model':
          setChatMessages((previous) => [
            ...previous,
            {
              type: 'assistant',
              content: `**Current Model**: ${data.current.model}\n\n**Available Models**:\n\nClaude: ${data.available.claude.join(', ')}\n\nCursor: ${data.available.cursor.join(', ')}`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'cost': {
          const costMessage = `**Token Usage**: ${data.tokenUsage.used.toLocaleString()} / ${data.tokenUsage.total.toLocaleString()} (${data.tokenUsage.percentage}%)\n\n**Estimated Cost**:\n- Input: $${data.cost.input}\n- Output: $${data.cost.output}\n- **Total**: $${data.cost.total}\n\n**Model**: ${data.model}`;
          setChatMessages((previous) => [
            ...previous,
            { type: 'assistant', content: costMessage, timestamp: Date.now() },
          ]);
          break;
        }

        case 'status': {
          const statusMessage = `**System Status**\n\n- Version: ${data.version}\n- Uptime: ${data.uptime}\n- Model: ${data.model}\n- Provider: ${data.provider}\n- Node.js: ${data.nodeVersion}\n- Platform: ${data.platform}`;
          setChatMessages((previous) => [
            ...previous,
            { type: 'assistant', content: statusMessage, timestamp: Date.now() },
          ]);
          break;
        }

        case 'memory':
          if (data.error) {
            setChatMessages((previous) => [
              ...previous,
              {
                type: 'assistant',
                content: `⚠️ ${data.message}`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setChatMessages((previous) => [
              ...previous,
              {
                type: 'assistant',
                content: `📝 ${data.message}\n\nPath: \`${data.path}\``,
                timestamp: Date.now(),
              },
            ]);
            if (data.exists && onFileOpen) {
              onFileOpen(data.path);
            }
          }
          break;

        case 'config':
          onShowSettings?.();
          break;

        case 'rewind':
          if (data.error) {
            setChatMessages((previous) => [
              ...previous,
              {
                type: 'assistant',
                content: `⚠️ ${data.message}`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setChatMessages((previous) => previous.slice(0, -data.steps * 2));
            setChatMessages((previous) => [
              ...previous,
              {
                type: 'assistant',
                content: `⏪ ${data.message}`,
                timestamp: Date.now(),
              },
            ]);
          }
          break;

        default:
          console.warn('Unknown built-in command action:', action);
      }
    },
    [onFileOpen, onShowSettings, setChatMessages, setSessionMessages],
  );

  const handleCustomCommand = useCallback(async (result: CommandExecutionResult) => {
    const { content, hasBashCommands } = result;

    if (hasBashCommands) {
      const confirmed = window.confirm(
        'This command contains bash commands that will be executed. Do you want to proceed?',
      );
      if (!confirmed) {
        setChatMessages((previous) => [
          ...previous,
          {
            type: 'assistant',
            content: '❌ Command execution cancelled',
            timestamp: Date.now(),
          },
        ]);
        return;
      }
    }

    const commandContent = content || '';
    setInput(commandContent);
    inputValueRef.current = commandContent;

    // Defer submit to next tick so the command text is reflected in UI before dispatching.
    setTimeout(() => {
      if (handleSubmitRef.current) {
        handleSubmitRef.current(createFakeSubmitEvent());
      }
    }, 0);
  }, [setChatMessages]);

  const resolveCurrentModel = useCallback(() => {
    switch (provider) {
      case 'cursor':
        return cursorModel;
      case 'codex':
        return codexModel;
      case 'gemini':
        return geminiModel;
      default:
        return claudeModel;
    }
  }, [claudeModel, codexModel, cursorModel, geminiModel, provider]);

  const executeCommand = useCallback(
    async (command: SlashCommand, rawInput?: string) => {
      if (!command || !selectedProject) {
        return;
      }

      try {
        const effectiveInput = rawInput ?? input;
        const commandMatch = effectiveInput.match(new RegExp(`${escapeRegExp(command.name)}\\s*(.*)`));
        const args =
          commandMatch && commandMatch[1] ? commandMatch[1].trim().split(/\s+/) : [];

        const context = {
          projectPath: selectedProject.fullPath || selectedProject.path,
          projectName: selectedProject.name,
          sessionId: currentSessionId,
          provider,
          model: resolveCurrentModel(),
          tokenUsage: tokenBudget,
        };

        const response = await authenticatedFetch('/api/commands/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandName: command.name,
            commandPath: command.path,
            args,
            context,
          }),
        });

        if (!response.ok) {
          let errorMessage = `Failed to execute command (${response.status})`;
          try {
            const errorData = await response.json();
            errorMessage = errorData?.message || errorData?.error || errorMessage;
          } catch {
            // Ignore JSON parse failures and use fallback message.
          }
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as CommandExecutionResult;
        if (result.type === 'builtin') {
          handleBuiltInCommand(result);
          setInput('');
          inputValueRef.current = '';
        } else if (result.type === 'custom') {
          await handleCustomCommand(result);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error executing command:', error);
        setChatMessages((previous) => [
          ...previous,
          {
            type: 'assistant',
            content: `Error executing command: ${message}`,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [
      claudeModel,
      codexModel,
      currentSessionId,
      cursorModel,
      geminiModel,
      handleBuiltInCommand,
      handleCustomCommand,
      input,
      provider,
      resolveCurrentModel,
      selectedProject,
      setChatMessages,
      tokenBudget,
    ],
  );

  const {
    slashCommands,
    slashCommandsCount,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    handleCommandInputChange,
    handleCommandMenuKeyDown,
  } = useSlashCommands({
    selectedProject,
    input,
    setInput,
    textareaRef,
    onExecuteCommand: executeCommand,
  });

  const {
    showFileDropdown,
    filteredFiles,
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    registerFileMentions,
    setCursorPosition,
    handleFileMentionsKeyDown,
  } = useFileMentions({
    selectedProject,
    input,
    setInput,
    textareaRef,
  });

  const syncInputOverlayScroll = useCallback((target: HTMLTextAreaElement) => {
    if (!inputHighlightRef.current || !target) {
      return;
    }
    inputHighlightRef.current.scrollTop = target.scrollTop;
    inputHighlightRef.current.scrollLeft = target.scrollLeft;
  }, []);

  const applySkillPrefix = useCallback((skillValue: string) => {
    if (!skillValue) {
      return;
    }

    const skillPrefix = getSkillPrefix(provider, skillValue);
    setInput((previousInput) => {
      const cleanedInput = stripLeadingSkillPrefix(previousInput);
      const nextInput = `${skillPrefix}${cleanedInput}`;
      inputValueRef.current = nextInput;
      return nextInput;
    });

    setTimeout(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }, 0);
  }, [provider]);

  const handleSkillSelect = useCallback((skillValue: string) => {
    setSelectedSkill(skillValue);
    if (!skillValue) {
      return;
    }
    applySkillPrefix(skillValue);
  }, [applySkillPrefix]);

  const resetAttachmentState = useCallback(() => {
    setAttachedFiles([]);
    setUploadingFiles(new Map());
    setFileErrors(new Map());
  }, []);

  const resetComposerState = useCallback(() => {
    setInput('');
    inputValueRef.current = '';
    resetCommandMenuState();
    resetAttachmentState();
    setIsTextareaExpanded(false);
    setThinkingMode('none');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [resetAttachmentState, resetCommandMenuState]);

  const handleAttachmentFiles = useCallback((files: File[]) => {
    const oversizedFileNames: string[] = [];
    const acceptedFiles: File[] = [];

    files.forEach((file) => {
      try {
        if (!file || typeof file !== 'object') {
          console.warn('Invalid file object:', file);
          return;
        }

        if (typeof file.size !== 'number' || file.size > MAX_ATTACHMENT_SIZE) {
          oversizedFileNames.push(file.name || 'Unknown file');
          return;
        }

        acceptedFiles.push(file);
      } catch (error) {
        console.error('Error validating file:', error, file);
      }
    });

    if (oversizedFileNames.length > 0) {
      setFileErrors((previous) => {
        const next = new Map(previous);
        oversizedFileNames.forEach((name) => next.set(name, ATTACHMENT_SIZE_ERROR));
        return next;
      });
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    setAttachedFiles((previous) => {
      const deduped = new Map<string, File>();
      [...previous, ...acceptedFiles].forEach((file) => {
        const dedupeKey = `${file.name}:${file.size}:${file.lastModified}`;
        deduped.set(dedupeKey, file);
      });
      return Array.from(deduped.values()).slice(0, MAX_ATTACHMENTS);
    });
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      const pastedFiles: File[] = [];

      items.forEach((item) => {
        if (item.kind !== 'file') {
          return;
        }
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      });

      if (pastedFiles.length === 0 && event.clipboardData.files.length > 0) {
        pastedFiles.push(...Array.from(event.clipboardData.files));
      }

      if (pastedFiles.length > 0) {
        handleAttachmentFiles(pastedFiles);
      }
    },
    [handleAttachmentFiles],
  );

  const dropzoneConfig: any = {
    maxSize: MAX_ATTACHMENT_SIZE,
    maxFiles: MAX_ATTACHMENTS,
    onDrop: handleAttachmentFiles,
    noClick: true,
    noKeyboard: true,
  };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone(dropzoneConfig);

  const handleSubmit = useCallback(
    async (
      event: any,
    ) => {
      event.preventDefault();
      const currentInput = inputValueRef.current;
      const hasInputText = currentInput.trim().length > 0;
      const hasAttachments = attachedFiles.length > 0;
      if ((!hasInputText && !hasAttachments) || isLoading || !selectedProject) {
        return;
      }

      // Intercept slash commands: if input starts with /commandName, execute as command with args
      const trimmedInput = currentInput.trim();
      if (trimmedInput.startsWith('/')) {
        const firstSpace = trimmedInput.indexOf(' ');
        const commandName = firstSpace > 0 ? trimmedInput.slice(0, firstSpace) : trimmedInput;
        const matchedCommand = slashCommands.find((cmd: SlashCommand) => cmd.name === commandName);
        if (matchedCommand) {
          executeCommand(matchedCommand, trimmedInput);
          resetComposerState();
          return;
        }
      }

      let messageContent = currentInput;
      const selectedThinkingMode = thinkingModes.find((mode: { id: string; prefix?: string }) => mode.id === thinkingMode);
      if (selectedThinkingMode && selectedThinkingMode.prefix) {
        messageContent = `${selectedThinkingMode.prefix}: ${currentInput}`;
      }

      let displayedUserMessageContent = currentInput;
      if (attachedFiles.length > 0) {
        const uploadedReferences: string[] = [];
        try {
          const initResponse = await api.initializeUploads(selectedProject.name);
          if (!initResponse.ok) {
            throw new Error('Failed to initialize upload directory');
          }

          for (const file of attachedFiles) {
            const response = await api.uploadFiles(selectedProject.name, file);
            if (!response.ok) {
              throw new Error(`Failed to upload file: ${file.name}`);
            }

            const result = await response.json();
            const normalizedReference = normalizeUploadedReference(result?.reference);

            if (!normalizedReference) {
              throw new Error(`Missing upload reference for file: ${file.name}`);
            }

            uploadedReferences.push(normalizedReference);
          }

          if (uploadedReferences.length > 0) {
            registerFileMentions(uploadedReferences);
            messageContent = appendReferencesToMessage(messageContent, uploadedReferences);
            displayedUserMessageContent = appendReferencesToMessage(
              displayedUserMessageContent,
              uploadedReferences,
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error('File upload failed:', error);
          setChatMessages((previous) => [
            ...previous,
            {
              type: 'error',
              content: `Failed to upload files: ${message}`,
              timestamp: new Date(),
            },
          ]);
          return;
        }
      }

      const userMessage: ChatMessage = {
        type: 'user',
        content: displayedUserMessageContent,
        timestamp: new Date(),
      };

      setChatMessages((previous) => [...previous, userMessage]);
      setIsLoading(true); // Processing banner starts
      setCanAbortSession(true);
      setClaudeStatus({
        text: 'Processing',
        tokens: 0,
        can_interrupt: true,
      });

      setIsUserScrolledUp(false);
      setTimeout(() => scrollToBottom(), 100);

      const effectiveSessionId =
        currentSessionId || selectedSession?.id || sessionStorage.getItem('cursorSessionId');
      const sessionToActivate = effectiveSessionId || `new-session-${Date.now()}`;

      if (!effectiveSessionId && !selectedSession?.id) {
        if (typeof window !== 'undefined') {
          // Reset stale pending IDs from previous interrupted runs before creating a new one.
          sessionStorage.removeItem('pendingSessionId');
        }
        pendingViewSessionRef.current = { sessionId: null, startedAt: Date.now() };
      }

      const getToolsSettings = () => {
        const getSettingsKey = () => {
          switch (provider) {
            case 'cursor':
              return 'cursor-tools-settings';
            case 'codex':
              return 'codex-settings';
            case 'gemini':
              return 'gemini-settings';
            default:
              return 'claude-settings';
          }
        };

        try {
          const savedSettings = safeLocalStorage.getItem(getSettingsKey());
          if (savedSettings) {
            return JSON.parse(savedSettings);
          }
        } catch (error) {
          console.error('Error loading tools settings:', error);
        }

        return {
          allowedTools: [],
          disallowedTools: [],
          skipPermissions: false,
        };
      };

      const toolsSettings = getToolsSettings();
      const resolvedProjectPath = selectedProject.fullPath || selectedProject.path || '';
      const resume = Boolean(effectiveSessionId);

      let requestPayload: Record<string, unknown>;
      if (provider === 'cursor') {
        requestPayload = {
          type: 'cursor-command',
          command: messageContent,
          sessionId: effectiveSessionId,
          options: {
            cwd: resolvedProjectPath,
            projectPath: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume,
            model: cursorModel,
            skipPermissions: toolsSettings?.skipPermissions || false,
            toolsSettings,
          },
        };
      } else if (provider === 'codex') {
        requestPayload = {
          type: 'codex-command',
          command: messageContent,
          sessionId: effectiveSessionId,
          options: {
            cwd: resolvedProjectPath,
            projectPath: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume,
            model: codexModel,
            permissionMode: permissionMode === 'plan' ? 'default' : permissionMode,
          },
        };
      } else if (provider === 'gemini') {
        requestPayload = {
          type: 'gemini-command',
          command: messageContent,
          sessionId: effectiveSessionId,
          options: {
            cwd: resolvedProjectPath,
            projectPath: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume,
            model: geminiModel,
            permissionMode,
            toolsSettings,
          },
        };
      } else {
        requestPayload = {
          type: 'claude-command',
          command: messageContent,
          options: {
            projectPath: resolvedProjectPath,
            cwd: resolvedProjectPath,
            sessionId: effectiveSessionId,
            resume,
            toolsSettings,
            permissionMode,
            model: claudeModel,
          },
        };
      }

      const handleSendFailure = () => {
        pendingViewSessionRef.current = null;
        setIsLoading(false);
        setCanAbortSession(false);
        setClaudeStatus(null);
        setChatMessages((previous) => [
          ...previous,
          {
            type: 'error',
            content: 'Connection lost before request was sent. Please wait for reconnect and retry.',
            timestamp: new Date(),
          },
        ]);
      };

      const sent = sendMessage(requestPayload);
      if (!sent) {
        handleSendFailure();
        return;
      }

      onSessionActive?.(sessionToActivate);
      if (effectiveSessionId && !isTemporarySessionId(effectiveSessionId)) {
        onSessionProcessing?.(effectiveSessionId);
      }

      resetComposerState();

      safeLocalStorage.removeItem(`draft_input_${selectedProject.name}`);
    },
    [
      attachedFiles,
      claudeModel,
      codexModel,
      currentSessionId,
      cursorModel,
      executeCommand,
      geminiModel,
      isLoading,
      onSessionActive,
      onSessionProcessing,
      pendingViewSessionRef,
      permissionMode,
      provider,
      resetCommandMenuState,
      scrollToBottom,
      selectedProject,
      selectedSession?.id,
      sendMessage,
      setCanAbortSession,
      setChatMessages,
      setClaudeStatus,
      setIsLoading,
      setIsUserScrolledUp,
      slashCommands,
      thinkingMode,
      registerFileMentions,
      resetComposerState,
    ],
  );

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const savedInput = safeLocalStorage.getItem(`draft_input_${selectedProject.name}`) || '';
    setInput((previous) => {
      const next = previous === savedInput ? previous : savedInput;
      inputValueRef.current = next;
      return next;
    });
  }, [selectedProject?.name]);

  useEffect(() => {
    const resetSkillState = () => {
      setSkills([]);
      setSelectedSkill('');
    };

    if (!selectedProject) {
      resetSkillState();
      return;
    }

    if (!isSkillEnabledProvider(provider)) {
      resetSkillState();
      return;
    }

    let active = true;
    const loadSkills = async () => {
      try {
        const projectPath = getProjectPath(selectedProject);
        const endpoint = buildSkillsEndpoint(provider, projectPath);
        const response = await authenticatedFetch(endpoint);
        if (!response.ok) {
          throw new Error(`Failed to load skills (${response.status})`);
        }

        const payload = await response.json() as SkillsApiResponse;
        const skillsPayload = Array.isArray(payload?.skills) ? payload.skills : [];
        const nextSkills = skillsPayload
          .map(normalizeSkillOption)
          .filter((skill): skill is SkillOption => Boolean(skill));

        if (!active) {
          return;
        }

        setSkills(nextSkills);
        setSelectedSkill((previousSkill) => (
          nextSkills.some((skill) => skill.value === previousSkill) ? previousSkill : ''
        ));
      } catch (error) {
        if (!active) {
          return;
        }
        console.error('Error loading skills:', error);
        resetSkillState();
      }
    };

    loadSkills();

    return () => {
      active = false;
    };
  }, [provider, selectedProject?.fullPath, selectedProject?.path, selectedProject?.name]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    if (input !== '') {
      safeLocalStorage.setItem(`draft_input_${selectedProject.name}`, input);
    } else {
      safeLocalStorage.removeItem(`draft_input_${selectedProject.name}`);
    }
  }, [input, selectedProject]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    // Re-run when input changes so restored drafts get the same autosize behavior as typed text.
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
    const expanded = textareaRef.current.scrollHeight > lineHeight * 2;
    setIsTextareaExpanded(expanded);
  }, [input]);

  useEffect(() => {
    if (!textareaRef.current || input.trim()) {
      return;
    }
    textareaRef.current.style.height = 'auto';
    setIsTextareaExpanded(false);
  }, [input]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      const cursorPos = event.target.selectionStart;

      setInput(newValue);
      inputValueRef.current = newValue;
      setCursorPosition(cursorPos);

      if (!newValue.trim()) {
        event.target.style.height = 'auto';
        setIsTextareaExpanded(false);
        resetCommandMenuState();
        return;
      }

      handleCommandInputChange(newValue, cursorPos);
    },
    [handleCommandInputChange, resetCommandMenuState, setCursorPosition],
  );

  const handleKeyDown = useCallback(
    (event: any) => {
      if (handleCommandMenuKeyDown(event)) {
        return;
      }

      if (handleFileMentionsKeyDown(event)) {
        return;
      }

      if (event.key === 'Tab' && !showFileDropdown && !showCommandMenu) {
        event.preventDefault();
        cyclePermissionMode();
        return;
      }

      if (event.key === 'Enter') {
        if (event.nativeEvent.isComposing) {
          return;
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
          event.preventDefault();
          handleSubmit(event);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !sendByCtrlEnter) {
          event.preventDefault();
          handleSubmit(event);
        }
      }
    },
    [
      cyclePermissionMode,
      handleCommandMenuKeyDown,
      handleFileMentionsKeyDown,
      handleSubmit,
      sendByCtrlEnter,
      showCommandMenu,
      showFileDropdown,
    ],
  );

  const handleTextareaClick = useCallback(
    (event: any) => {
      setCursorPosition(event.currentTarget.selectionStart);
    },
    [setCursorPosition],
  );

  const handleTextareaInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
      setCursorPosition(target.selectionStart);
      syncInputOverlayScroll(target);

      const lineHeight = parseInt(window.getComputedStyle(target).lineHeight);
      setIsTextareaExpanded(target.scrollHeight > lineHeight * 2);
    },
    [setCursorPosition, syncInputOverlayScroll],
  );

  const handleClearInput = useCallback(() => {
    setInput('');
    inputValueRef.current = '';
    resetCommandMenuState();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    setIsTextareaExpanded(false);
  }, [resetCommandMenuState]);

  const handleAbortSession = useCallback(() => {
    if (!canAbortSession) {
      return;
    }

    const pendingSessionId =
      typeof window !== 'undefined' ? sessionStorage.getItem('pendingSessionId') : null;
    const cursorSessionId =
      typeof window !== 'undefined' ? sessionStorage.getItem('cursorSessionId') : null;

    const candidateSessionIds = [
      currentSessionId,
      pendingViewSessionRef.current?.sessionId || null,
      pendingSessionId,
      provider === 'cursor' ? cursorSessionId : null,
      selectedSession?.id || null,
    ];

    const targetSessionId =
      candidateSessionIds.find((sessionId) => Boolean(sessionId) && !isTemporarySessionId(sessionId)) || null;

    if (!targetSessionId) {
      console.warn('Abort requested but no concrete session ID is available yet.');
      return;
    }

    sendMessage({
      type: 'abort-session',
      sessionId: targetSessionId,
      provider,
    });
  }, [canAbortSession, currentSessionId, pendingViewSessionRef, provider, selectedSession?.id, sendMessage]);

  const handleTranscript = useCallback((text: string) => {
    if (!text.trim()) {
      return;
    }

    setInput((previousInput) => {
      const newInput = previousInput.trim() ? `${previousInput} ${text}` : text;
      inputValueRef.current = newInput;

      setTimeout(() => {
        if (!textareaRef.current) {
          return;
        }

        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
        setIsTextareaExpanded(textareaRef.current.scrollHeight > lineHeight * 2);
      }, 0);

      return newInput;
    });
  }, []);

  const handleGrantToolPermission = useCallback(
    (suggestion: { entry: string; toolName: string }) => {
      if (!suggestion || provider !== 'claude') {
        return { success: false };
      }
      return grantClaudeToolPermission(suggestion.entry);
    },
    [provider],
  );

  const handlePermissionDecision = useCallback(
    (
      requestIds: string | string[],
      decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
    ) => {
      const ids = Array.isArray(requestIds) ? requestIds : [requestIds];
      const validIds = ids.filter(Boolean);
      if (validIds.length === 0) {
        return;
      }

      validIds.forEach((requestId) => {
        sendMessage({
          type: 'claude-permission-response',
          requestId,
          allow: Boolean(decision?.allow),
          updatedInput: decision?.updatedInput,
          message: decision?.message,
          rememberEntry: decision?.rememberEntry,
        });
      });

      setPendingPermissionRequests((previous) => {
        const next = previous.filter((request) => !validIds.includes(request.requestId));
        if (next.length === 0) {
          setClaudeStatus(null);
        }
        return next;
      });
    },
    [sendMessage, setClaudeStatus, setPendingPermissionRequests],
  );

  const [isInputFocused, setIsInputFocused] = useState(false);

  const handleInputFocusChange = useCallback(
    (focused: boolean) => {
      setIsInputFocused(focused);
      onInputFocusChange?.(focused);
    },
    [onInputFocusChange],
  );

  return {
    input,
    setInput,
    textareaRef,
    inputHighlightRef,
    isTextareaExpanded,
    thinkingMode,
    setThinkingMode,
    skills,
    selectedSkill,
    handleSkillSelect,
    slashCommandsCount,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    showFileDropdown,
    filteredFiles: filteredFiles as MentionableFile[],
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    attachedFiles,
    setAttachedFiles,
    uploadingFiles,
    fileErrors,
    getRootProps,
    getInputProps,
    isDragActive,
    openAttachmentPicker: open,
    handleSubmit,
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleTextareaClick,
    handleTextareaInput,
    syncInputOverlayScroll,
    handleClearInput,
    handleAbortSession,
    handleTranscript,
    handlePermissionDecision,
    handleGrantToolPermission,
    handleInputFocusChange,
    isInputFocused,
  };
}
