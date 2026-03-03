# Findings & Decisions

## Requirements (Feature 3)
- Add skills selector UI and backend API.
- Backend endpoint: `GET /api/skills?projectPath=...&provider=...`.
- Provider routing rules:
  - `codex`: `~/.agents/skills` + `~/.codex/skills` + `<projectPath>/.codex/skills`
  - `claude`: `~/.agents/skills` + `~/.claude/skills` + `<projectPath>/.claude/skills`
- Read one-level skill directories only, skip hidden dirs.
- Parse `SKILL.md` frontmatter `chinese` as display name.
- Return sorted merged list: `{ skills: [{ name, value, source }] }`.
- Frontend: when selecting skill, inject prefix:
  - `claude`: `/skill-name `
  - `codex`: `$skill-name `
  - remove existing leading skill prefix first.

## Existing Gaps Found
- `server/routes/skills.js` does not exist.
- `server/index.js` has no `/api/skills` route mount.
- Chat composer currently has no skills loading state and no selector UI.
- Input prefix injection on skill selection is not implemented.

## Implementation Decisions
| Topic | Decision |
|------|----------|
| Backend dedupe key | Use directory name as `value` and map key |
| Source precedence | Later directory layers can override earlier entries with same skill name |
| Frontend state location | Implement in `useChatComposerState` to reuse `setInput` and `inputValueRef` |
| Unsupported providers | Return empty skills on frontend; backend validates provider input |

## Implemented
- Added `server/routes/skills.js`.
  - Supports `GET /api/skills`.
  - Validates `provider` (`claude`/`codex`).
  - Validates `projectPath` via `validateWorkspacePath`.
  - Reads skill directories from common global, provider global, and provider project paths.
  - Parses `SKILL.md` frontmatter `chinese` field as display name.
  - Returns `{ skills }` sorted by display name.
- Mounted route in `server/index.js`:
  - `app.use('/api/skills', authenticateToken, skillsRoutes);`
- Updated `useChatComposerState`:
  - Loads skills when provider/project changes.
  - Stores `skills` and `selectedSkill`.
  - Injects provider-specific prefix on selection and removes existing leading skill prefix.
- Updated `ChatInterface` and `ChatComposer`:
  - Passes/consumes skill state and handlers.
  - Renders skills selector above input area for `claude` and `codex`.

## Verification
- `npm.cmd run typecheck`: pass
- `npm.cmd run build`: pass
- `node -e "import('./server/routes/skills.js')"`: pass
