# Task Plan: Skills Selector By Provider

## Goal
Implement `docs/feature_3_skills_selector_by_provider.md` end-to-end:
- backend `GET /api/skills?projectPath=...&provider=...`
- provider-based skills directory routing
- frontend skills selector above chat input with provider-specific prefix injection

## Current Phase
Phase 4

## Phases
### Phase 1: Requirements & Discovery
- [x] Read `docs/feature_3_skills_selector_by_provider.md`
- [x] Inspect backend route mounts and existing skills route status
- [x] Inspect chat composer architecture for selector insertion point
- **Status:** complete

### Phase 2: Backend Skills API
- [x] Add `server/routes/skills.js`
- [x] Implement provider-based directory collection and frontmatter parsing
- [x] Mount `/api/skills` route in `server/index.js`
- **Status:** complete

### Phase 3: Frontend Selector & Prefix Injection
- [x] Add skills loading in chat composer state (provider/project driven)
- [x] Add selected-skill prefix injection (`/` for claude, `$` for codex)
- [x] Render selector above chat input
- **Status:** complete

### Phase 4: Verification & Delivery
- [x] Run `npm.cmd run typecheck`
- [x] Run `npm.cmd run build`
- [x] Update planning artifacts and summarize changed files
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Implement skills state in `useChatComposerState` | Centralizes input mutation logic with existing composer state |
| Keep selector limited to `claude` and `codex` | Matches feature contract and avoids behavior drift for other providers |
| Deduplicate by skill folder name (`value`) | Ensures stable inject token and avoids duplicate options |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None | - | No blocking runtime/type errors encountered |
