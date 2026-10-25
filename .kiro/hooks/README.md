# Hooks — Finlux

Hooks are event-driven automations that Kiro runs on triggers such as saving a
file, submitting a prompt, or using a tool. Each hook is a JSON file in this
folder.

## Trigger events
`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `UserPromptSubmit`,
`PreTaskExec`, `PostTaskExec`, `PostFileCreate`, `PostFileSave`,
`PostFileDelete`.

## Example ideas for Finlux
- Run the backend linter/formatter on save of `backend/**/*.ts`.
- Run frontend type-checks on save of `frontend/**/*.ts`.
- Block commits that would stage a `.env` file.

## Configured hooks
- **format-backend** (`PostFileSave`, matcher `^backend/.*\.ts$`): runs Prettier
  `--write` and ESLint `--fix` over the backend after a backend TS file is saved.
- **format-frontend** (`PostFileSave`, matcher `^frontend/.*\.(ts|tsx|css)$`):
  runs Prettier `--write` and ESLint `--fix` over the frontend after a frontend
  TS/TSX/CSS file is saved.

Both hooks source nvm to pin Node 24.22.1 and use `pnpm exec`. They format the
whole app (not just the saved file) and always exit 0 so a save is never blocked.
Hooks become active on the next session start.
