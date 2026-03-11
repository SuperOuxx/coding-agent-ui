# Task Plan: Fix thinking UI stuck during assistant responses

## Goal
Find and fix the root cause of "thinking/processing gets stuck", then verify with reproducible evidence.

## Current Phase
Phase 5

## Phases
### Phase 1: Reproduce and scope
- [x] Confirm symptom and affected flow
- [x] Check upstream fix presence
- [x] Capture evidence
- **Status:** complete

### Phase 2: Root cause analysis
- [x] Inspect frontend realtime lifecycle filter
- [x] Inspect backend websocket terminal/error events
- [x] Identify deterministic root cause
- **Status:** complete

### Phase 3: Implement fix
- [x] Fix frontend lifecycle filter for unscoped terminal events
- [x] Ensure generic websocket errors carry session context
- [x] Improve user-visible error handling for generic `error`
- **Status:** complete

### Phase 4: Verification
- [x] Run type/build checks
- [x] Verify stuck lifecycle scenario no longer reproduces
- [x] Record results
- **Status:** complete

### Phase 5: Delivery
- [x] Summarize root cause and code changes
- [x] Report verification and residual risks
- **Status:** complete

## Key Questions
1. Are terminal events ever emitted without `sessionId`?
2. Can frontend filtering drop such events before lifecycle finalization?
3. Does backend generic error event include enough session context?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Inspect both frontend and backend | This bug is cross-layer lifecycle state |
| Keep a defensive frontend fallback | Prevent UI deadlock from incomplete event payloads |
| Also patch backend catch payload | Reduce ambiguity and future regressions |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg` regex parse error | 1 | Split and correct search expressions |

---

## Session: 2026-03-10 (Codex intermittent stuck re-analysis)

### Goal
Eliminate intermittent Codex "processing/thinking stuck" states, especially cases that remain stuck after page refresh.

### Phases
1. Scope and compare with upstream/local fixes - complete
2. Trace Codex-specific lifecycle and reconnect behavior - complete
3. Implement guardrails (send ack + status polling + backend timeout) - complete
4. Validate with static checks and builds - complete

### Key Decisions
- Keep existing lifecycle fix intact; target new failure branches instead of reverting logic.
- Add frontend send-ack handling to avoid false loading state when WS send fails.
- Add loading-phase status polling to recover from missed terminal events.
- Add Codex stream idle-timeout to prevent indefinitely running sessions.
