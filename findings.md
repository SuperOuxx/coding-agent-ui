# Findings & Decisions

## Requirements
- User reports the upstream "thinking stuck" fix is present but issue still occurs.
- Need complete investigation and durable fix, not a workaround.
- Deliver root cause, code fix, and verification evidence.

## Research Findings
- Upstream/local history includes fix commit `#483`:
  - `182ff45 fix(chat): finalize terminal lifecycle to prevent stuck processing/thinking UI`
  - `0590c5c fix(chat): finalize terminal lifecycle to prevent stuck processing/thinking UI`
- Current code still has a lifecycle gap:
  - In `useChatRealtimeHandlers.ts`, messages without `sessionId` can be dropped before `switch` handling due session filter logic.
  - The check `if (latestMessage.sessionId !== activeViewSessionId) return;` treats `undefined` as mismatch and returns early.
- Backend emits generic websocket errors without `sessionId`:
  - `server/index.js` catch branch sends `{ type: 'error', error }` only.
  - Those events are lifecycle-relevant but may be filtered out, leaving UI in loading/thinking state.
- Implemented fixes:
  - Frontend (`useChatRealtimeHandlers.ts`):
    - Added `isUnscopedLifecycleMessage` to allow unscoped lifecycle events for active/pending view.
    - Session mismatch check now only applies when `latestMessage.sessionId` exists.
    - Generic `error` now finalizes lifecycle and appends a visible chat error message.
  - Backend (`server/index.js`):
    - WebSocket catch now resolves `sessionId` from parsed payload/options/writer state and includes it in `type: 'error'` events.
    - Added `normalizedOptions` fallback to prevent `options: null` payloads from crashing provider handlers.

## Verification Findings
- `npm.cmd run build`: passed.
- `npm.cmd run typecheck`: passed.
- Runtime regression probe: started local server and sent `cursor-command` with `options: null`; confirmed generic `error` now includes expected `sessionId` and server remains alive.
- Build reported pre-existing CSS syntax warnings unrelated to this patch.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Patch frontend filter for unscoped lifecycle messages | Prevent terminal events from being dropped |
| Patch backend catch to include `sessionId` fallback | Reduce ambiguity and preserve event routing |
| Show generic `error` in chat while finalizing lifecycle | Avoid silent failures and improve debuggability |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `rg` regex command parse error | Fixed query expression and reran |

## Resources
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- `server/index.js`
- `server/claude-sdk.js`
- `server/cursor-cli.js`
- `server/gemini-cli.js`
- `server/openai-codex.js`
- `git log --grep "thinking|stream|stuck|freeze|hang|reasoning"`

## Visual/Browser Findings
- Not required for current root-cause confirmation.

---

## Session Findings: 2026-03-10 (Codex intermittent stuck)

## New Research Findings
- Local `upstream/main` comparison: no newer upstream commit beyond the already-included lifecycle fix for this issue class (`main...upstream/main` right side count `0`).
- Existing frontend/backend lifecycle fix is present in current branch, so the intermittent issue is likely from adjacent branches:
  - message send attempted while WebSocket is disconnected (UI enters loading, request never actually sent),
  - terminal events missed during reconnect, with no active status polling,
  - Codex streamed turn can remain running without terminal events for extended periods.
- Codex backend (`server/openai-codex.js`) had no idle timeout, so sessions could stay `running` indefinitely when stream activity stalls.

## Implemented Mitigations
- `sendMessage` now returns a boolean delivery signal (sent vs not sent).
- Composer submit path now handles send failure immediately:
  - clears loading/abort state,
  - clears pending view session,
  - appends explicit error message to chat.
- Session state now polls `check-session-status` every 5s while loading (with immediate first poll) for selected/current session.
- Codex backend now has configurable stream idle timeout:
  - env: `CODEX_STREAM_IDLE_TIMEOUT_MS` (min 10000, default 120000),
  - timed-out sessions are aborted, marked non-running, and emit `codex-error` with timeout message.

## Verification Findings (This Session)
- `npm.cmd run typecheck`: pass.
- `npm.cmd run build`: pass (same pre-existing CSS/minify warnings).
- `node --check server/openai-codex.js`: pass.
