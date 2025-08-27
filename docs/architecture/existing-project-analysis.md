# Existing Project Analysis

## Current Project State
- Primary Purpose: Render LaTeX in Gmail compose and reading views.
- Current Tech Stack: Chrome MV3, content script (`src/content.js`), options UI (`src/options.html`, `src/options.js`), CSS (`src/styles.css`); ES6; no build/bundler.
- Rendering Services: External CodeCogs (primary) with WordPress fallback; optional Simple Math (HTML/CSS) mode.
- Architecture Style: Client‑side DOM transformation in a content script; no background/service worker; options page; storage via `chrome.storage`.
- Deployment Method: Load unpacked during development; Chrome Web Store listing planned (per README), not present in repo.

## Available Documentation
- README.md (features, limitations, privacy), AGENTS.md
- Manifest (`manifest.json`) and source (`src/`)
- Sharded PRD (`docs/prd/*`), PRD root (`docs/prd.md`)
- Stories (`docs/stories/`), reports (`docs/reports/`), QA (`docs/qa/`)
- Test harnesses (`tests/*.html`), manual test report

## Identified Constraints
- Privacy: LaTeX sent to external services (CodeCogs/WordPress); not suitable for confidential content; requires network.
- Offline: No offline rendering unless using Simple Math mode; no caching layer.
- Rate Limits: 60 API calls/min with internal throttling; no dedup/cache.
- Gmail DOM: Fragile selectors; Gmail UI changes can break injection/observers.
- Permissions: Minimal (`activeTab`, `storage`, host `*://mail.google.com/*`); adding scopes triggers re‑auth friction.
- Storage Quotas: Sync/local size limits; validation/clamping implemented; no migration versioning noted.
- Background Infra: No service worker; introducing one would change topology and messaging patterns.
- Packaging: No CI/store packaging in repo; manual load only.
- Testing: Manual harness pages; no automated e2e/unit tests.

> Validation checkpoint: Based on analysis of your project, these reflect the current system characteristics. Please confirm these observations are accurate before we proceed to architectural recommendations.
