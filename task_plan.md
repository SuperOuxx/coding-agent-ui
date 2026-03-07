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
