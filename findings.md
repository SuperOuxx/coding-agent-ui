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
