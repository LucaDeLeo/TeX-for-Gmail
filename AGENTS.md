# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json`: Chrome MV3 manifest.
- `src/`: Extension code (`content.js`, `options.html`, `options.js`, `styles.css`).
- `assets/`: Icons and static assets.
- `tests/`: HTML test harnesses (e.g., `tests/test-story-4.3.html`).
- `docs/`: Product docs and reports. PRD is sharded under `docs/prd/`; stories live in `docs/stories/` as `{epic}.{story}.story.md` (e.g., `4.3.story.md`).
- `.bmad-core/`: BMAD workflows, tasks, and templates for stories/QA.

## Build, Test, and Development
- Run locally (no build):
  - Open Chrome → `chrome://extensions` → Enable Developer Mode → Load Unpacked → select repo root (where `manifest.json` lives).
  - After code changes, click “Reload” on the extension.
- Manual/visual tests:
  - With the extension loaded, open any `tests/*.html` in Chrome (e.g., `tests/test-inline-display.html`, `tests/test-story-4.3.html`).
  - For Gmail flows, test directly in Gmail compose/read views.

## Coding Style & Naming
- JavaScript: ES6 (`.jshintrc` enforces `esversion: 6`).
- Indentation: 2 spaces; use `const`/`let`; end lines with semicolons.
- Naming: camelCase for variables/functions; PascalCase for classes; UPPER_SNAKE for constants.
- Files: keep `src/` flat and cohesive; story files follow `{epic}.{story}.story.md`.

## Testing Guidelines
- Prefer small, focused scenarios in `tests/` harness pages; keep UI instructions visible.
- Verify acceptance criteria by mapping to specific harness sections (e.g., click-to-edit, shortcuts, options).
- When adding features, include or update a `tests/test-story-X.Y.html` page to demonstrate behavior.

## Commit & Pull Request Guidelines
- Use conventional commits when possible: `feat:`, `fix:`, `refactor:`, `docs:` (see `git log`).
- Scope PRs narrowly; include:
  - What changed and why, linked story (e.g., `4.3`) and PRD section.
  - Screenshots/GIFs for UI or test harness snippets.
  - Updated docs/tests paths (e.g., `tests/test-story-4.3.html`).

agents:
  - id: analyst
    path: .bmad-core/agents/analyst.md
  - id: architect
    path: .bmad-core/agents/architect.md
  - id: bmad-master
    path: .bmad-core/agents/bmad-master.md
  - id: bmad-orchestrator
    path: .bmad-core/agents/bmad-orchestrator.md
  - id: dev
    path: .bmad-core/agents/dev.md
  - id: pm
    path: .bmad-core/agents/pm.md
  - id: po
    path: .bmad-core/agents/po.md
  - id: qa
    path: .bmad-core/agents/qa.md
  - id: sm
    path: .bmad-core/agents/sm.md
  - id: ux-expert
    path: .bmad-core/agents/ux-expert.md
