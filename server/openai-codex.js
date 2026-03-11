/**
 * OpenAI Codex SDK Integration
 * =============================
 *
 * This module provides integration with the OpenAI Codex SDK for non-interactive
 * chat sessions. It mirrors the pattern used in claude-sdk.js for consistency.
 *
 * ## Usage
 *
 * - queryCodex(command, options, ws) - Execute a prompt with streaming via WebSocket
 * - abortCodexSession(sessionId) - Cancel an active session
 * - isCodexSessionActive(sessionId) - Check if a session is running
 * - getActiveCodexSessions() - List all active sessions
 */

import { Codex } from '@openai/codex-sdk';

// Track active sessions
const activeCodexSessions = new Map();
const DEFAULT_CODEX_STREAM_IDLE_TIMEOUT_MS = 120000;

function getCodexStreamIdleTimeoutMs() {
  const rawValue = Number.parseInt(process.env.CODEX_STREAM_IDLE_TIMEOUT_MS || '', 10);
  if (Number.isFinite(rawValue) && rawValue >= 10000) {
    return rawValue;
  }
  return DEFAULT_CODEX_STREAM_IDLE_TIMEOUT_MS;
}

function isAbortLikeError(error) {
  return error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted');
}

function isSessionRunning(session) {
  return session?.status === 'running';
}

function isSessionInterrupted(session) {
  return !session || session.status === 'aborted' || session.status === 'timed_out';
}

/**
 * Transform Codex SDK event to WebSocket message format
 * @param {object} event - SDK event
 * @returns {object} - Transformed event for WebSocket
 */
function transformCodexEvent(event) {
  // Map SDK event types to a consistent format
  switch (event.type) {
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      const item = event.item;
      if (!item) {
        return { type: event.type, item: null };
      }

      // Transform based on item type
      switch (item.type) {
        case 'agent_message':
          return {
            type: 'item',
            itemType: 'agent_message',
            message: {
              role: 'assistant',
              content: item.text
            }
          };

        case 'reasoning':
          return {
            type: 'item',
            itemType: 'reasoning',
            message: {
              role: 'assistant',
              content: item.text,
              isReasoning: true
            }
          };

        case 'command_execution':
          return {
            type: 'item',
            itemType: 'command_execution',
            command: item.command,
            output: item.aggregated_output,
            exitCode: item.exit_code,
            status: item.status
          };

        case 'file_change':
          return {
            type: 'item',
            itemType: 'file_change',
            changes: item.changes,
            status: item.status
          };

        case 'mcp_tool_call':
          return {
            type: 'item',
            itemType: 'mcp_tool_call',
            server: item.server,
            tool: item.tool,
            arguments: item.arguments,
            result: item.result,
            error: item.error,
            status: item.status
          };

        case 'web_search':
          return {
            type: 'item',
            itemType: 'web_search',
            query: item.query
          };

        case 'todo_list':
          return {
            type: 'item',
            itemType: 'todo_list',
            items: item.items
          };

        case 'error':
          return {
            type: 'item',
            itemType: 'error',
            message: {
              role: 'error',
              content: item.message
            }
          };

        default:
          return {
            type: 'item',
            itemType: item.type,
            item: item
          };
      }

    case 'turn.started':
      return {
        type: 'turn_started'
      };

    case 'turn.completed':
      return {
        type: 'turn_complete',
        usage: event.usage
      };

    case 'turn.failed':
      return {
        type: 'turn_failed',
        error: event.error
      };

    case 'thread.started':
      return {
        type: 'thread_started',
        threadId: event.id
      };

    case 'error':
      return {
        type: 'error',
        message: event.message
      };

    default:
      return {
        type: event.type,
        data: event
      };
  }
}

/**
 * Map permission mode to Codex SDK options
 * @param {string} permissionMode - 'default', 'acceptEdits', or 'bypassPermissions'
 * @returns {object} - { sandboxMode, approvalPolicy }
 */
function mapPermissionModeToCodexOptions(permissionMode) {
  switch (permissionMode) {
    case 'acceptEdits':
      return {
        sandboxMode: 'workspace-write',
        approvalPolicy: 'never'
      };
    case 'bypassPermissions':
      return {
        sandboxMode: 'danger-full-access',
        approvalPolicy: 'never'
      };
    case 'default':
    default:
      return {
        sandboxMode: 'workspace-write',
        approvalPolicy: 'untrusted'
      };
  }
}

/**
 * Execute a Codex query with streaming
 * @param {string} command - The prompt to send
 * @param {object} options - Options including cwd, sessionId, model, permissionMode
 * @param {WebSocket|object} ws - WebSocket connection or response writer
 */
export async function queryCodex(command, options = {}, ws) {
  const {
    sessionId,
    cwd,
    projectPath,
    model,
    permissionMode = 'default'
  } = options;

  const workingDirectory = cwd || projectPath || process.cwd();
  const { sandboxMode, approvalPolicy } = mapPermissionModeToCodexOptions(permissionMode);

  let codex;
  let thread;
  let currentSessionId = sessionId;
  const abortController = new AbortController();
  const streamIdleTimeoutMs = getCodexStreamIdleTimeoutMs();
  const idleCheckIntervalMs = Math.min(10000, Math.max(3000, Math.floor(streamIdleTimeoutMs / 3)));
  let lastActivityAt = Date.now();
  let idleCheckTimer = null;

  try {
    // Initialize Codex SDK
    codex = new Codex();

    // Thread options with sandbox and approval settings
    const threadOptions = {
      workingDirectory,
      skipGitRepoCheck: true,
      sandboxMode,
      approvalPolicy,
      model
    };

    // Start or resume thread
    if (sessionId) {
      thread = codex.resumeThread(sessionId, threadOptions);
    } else {
      thread = codex.startThread(threadOptions);
    }

    // Get the thread ID
    currentSessionId = thread.id || sessionId || `codex-${Date.now()}`;

    // Track the session
    activeCodexSessions.set(currentSessionId, {
      thread,
      codex,
      status: 'running',
      abortController,
      startedAt: new Date().toISOString()
    });

    idleCheckTimer = setInterval(() => {
      const session = activeCodexSessions.get(currentSessionId);
      if (!isSessionRunning(session)) {
        return;
      }

      if (Date.now() - lastActivityAt < streamIdleTimeoutMs) {
        return;
      }

      session.status = 'timed_out';
      console.warn(
        `[Codex] Session ${currentSessionId} timed out after ${streamIdleTimeoutMs}ms without stream activity`,
      );
      try {
        session.abortController?.abort();
      } catch (abortError) {
        console.warn(`[Codex] Failed to abort timed out session ${currentSessionId}:`, abortError);
      }
    }, idleCheckIntervalMs);

    // Send session created event
    sendMessage(ws, {
      type: 'session-created',
      sessionId: currentSessionId,
      provider: 'codex'
    });

    // Execute with streaming
    const streamedTurn = await thread.runStreamed(command, {
      signal: abortController.signal
    });

    for await (const event of streamedTurn.events) {
      // Check if session was aborted
      const session = activeCodexSessions.get(currentSessionId);
      if (isSessionInterrupted(session)) {
        break;
      }
      lastActivityAt = Date.now();

      if (event.type === 'item.started' || event.type === 'item.updated') {
        continue;
      }

      const transformed = transformCodexEvent(event);

      sendMessage(ws, {
        type: 'codex-response',
        data: transformed,
        sessionId: currentSessionId
      });

      // Extract and send token usage if available (normalized to match Claude format)
      if (event.type === 'turn.completed' && event.usage) {
        const totalTokens = (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0);
        sendMessage(ws, {
          type: 'token-budget',
          data: {
            used: totalTokens,
            total: 200000 // Default context window for Codex models
          },
          sessionId: currentSessionId
        });
      }
    }

    // Send completion event
    sendMessage(ws, {
      type: 'codex-complete',
      sessionId: currentSessionId,
      actualSessionId: thread.id
    });

  } catch (error) {
    const session = currentSessionId ? activeCodexSessions.get(currentSessionId) : null;
    const isAbortError = isAbortLikeError(error);
    const wasAborted = session?.status === 'aborted' || (!session && isAbortError);
    const wasTimedOut = session?.status === 'timed_out';

    if (!wasAborted) {
      const errorMessage = wasTimedOut
        ? `Codex request timed out after ${Math.round(streamIdleTimeoutMs / 1000)}s of inactivity`
        : error?.message || String(error);
      console.error('[Codex] Error:', error);
      sendMessage(ws, {
        type: 'codex-error',
        error: errorMessage,
        sessionId: currentSessionId
      });
    }

  } finally {
    if (idleCheckTimer) {
      clearInterval(idleCheckTimer);
    }
    // Update session status
    if (currentSessionId) {
      const session = activeCodexSessions.get(currentSessionId);
      if (isSessionRunning(session)) {
        session.status = 'completed';
      }
    }
  }
}

/**
 * Abort an active Codex session
 * @param {string} sessionId - Session ID to abort
 * @returns {boolean} - Whether abort was successful
 */
export function abortCodexSession(sessionId) {
  const session = activeCodexSessions.get(sessionId);

  if (!session) {
    return false;
  }

  session.status = 'aborted';
  try {
    session.abortController?.abort();
  } catch (error) {
    console.warn(`[Codex] Failed to abort session ${sessionId}:`, error);
  }

  return true;
}

/**
 * Check if a session is active
 * @param {string} sessionId - Session ID to check
 * @returns {boolean} - Whether session is active
 */
export function isCodexSessionActive(sessionId) {
  const session = activeCodexSessions.get(sessionId);
  return isSessionRunning(session);
}

/**
 * Get all active sessions
 * @returns {Array} - Array of active session info
 */
export function getActiveCodexSessions() {
  const sessions = [];

  for (const [id, session] of activeCodexSessions.entries()) {
    if (isSessionRunning(session)) {
      sessions.push({
        id,
        status: session.status,
        startedAt: session.startedAt
      });
    }
  }

  return sessions;
}

/**
 * Helper to send message via WebSocket or writer
 * @param {WebSocket|object} ws - WebSocket or response writer
 * @param {object} data - Data to send
 */
function sendMessage(ws, data) {
  try {
    if (ws.isSSEStreamWriter || ws.isWebSocketWriter) {
      // Writer handles stringification (SSEStreamWriter or WebSocketWriter)
      ws.send(data);
    } else if (typeof ws.send === 'function') {
      // Raw WebSocket - stringify here
      ws.send(JSON.stringify(data));
    }
  } catch (error) {
    console.error('[Codex] Error sending message:', error);
  }
}

// Clean up old completed sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [id, session] of activeCodexSessions.entries()) {
    if (!isSessionRunning(session)) {
      const startedAt = new Date(session.startedAt).getTime();
      if (now - startedAt > maxAge) {
        activeCodexSessions.delete(id);
      }
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
