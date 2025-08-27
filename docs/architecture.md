# TeX for Gmail Brownfield Enhancement Architecture

> This document outlines the architectural approach for enhancing TeX for Gmail with [Enhancement: TBD — to be provided by product/owner]. It serves as the guiding blueprint for incremental, low‑risk integration with the existing system.

## Introduction
This document supplements the current extension’s architecture by defining how new components will integrate with existing systems. Where conflicts arise between new and existing patterns, this document provides guidance on maintaining consistency while implementing enhancements.

- Source PRD: Using sharded PRD under `docs/prd/` (confirm or provide brownfield PRD).
- Activation scope: Significant enhancements impacting rendering, messaging, security/permissions, or options/storage.

## Existing Project Analysis

### Current Project State
- Primary Purpose: Render LaTeX in Gmail compose and reading views.
- Current Tech Stack: Chrome MV3, content script (`src/content.js`), options UI (`src/options.html`, `src/options.js`), CSS (`src/styles.css`); ES6; no build/bundler.
- Rendering Services: External CodeCogs (primary) with WordPress fallback; optional Simple Math (HTML/CSS) mode.
- Architecture Style: Client‑side DOM transformation in a content script; no background/service worker; options page; storage via `chrome.storage`.
- Deployment Method: Load unpacked during development; Chrome Web Store listing planned (per README), not present in repo.

### Available Documentation
- README.md (features, limitations, privacy), AGENTS.md
- Manifest (`manifest.json`) and source (`src/`)
- Sharded PRD (`docs/prd/*`), PRD root (`docs/prd.md`)
- Stories (`docs/stories/`), reports (`docs/reports/`), QA (`docs/qa/`)
- Test harnesses (`tests/*.html`), manual test report

### Identified Constraints
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

## Change Log
| Change         | Date       | Version | Description                 | Author  |
| -------------- | ---------- | ------- | --------------------------- | ------- |
| Initial draft  | 2025-08-27 | v0.1    | Created brownfield baseline | Winston |

## Tech Stack Alignment

### Existing Technology Stack

| Category         | Current Technology                     | Version | Usage in Enhancement | Notes |
| ---------------- | -------------------------------------- | ------- | -------------------- | ----- |
| Runtime          | Chrome Extensions (Manifest V3)        | MV3     | Maintain             | Content script + options UI; no service worker today |
| Language/Style   | JavaScript (ES6)                       | ES6     | Maintain             | Enforced via `.jshintrc` |
| UI               | Options UI (HTML/CSS/JS)               | N/A     | Extend               | `src/options.html`, `src/options.js`, `src/styles.css` |
| Content Script   | DOM processing + MutationObserver       | N/A     | Maintain             | `src/content.js`; WeakMaps, debouncing, cleanup patterns |
| Rendering (ext)  | CodeCogs (primary)                     | HTTP    | Maintain (fallback)  | URL generation with DPI and `\displaystyle` for display |
| Rendering (ext)  | WordPress `s0.wp.com/latex.php`        | HTTP    | Maintain (fallback)  | Secondary fallback with server health checks |
| Rendering (local)| Simple Math (HTML/CSS)                 | N/A     | Maintain/Extend      | Optional offline; lower fidelity vs images |
| Storage          | `chrome.storage` sync/local            | N/A     | Maintain/Extend      | Validation/clamping implemented; quotas apply |
| Permissions      | `activeTab`, `storage`, host: Gmail    | N/A     | Maintain             | Least privilege; adding scopes increases friction |
| Testing          | Manual HTML harness pages              | N/A     | Extend               | `tests/*.html`; verify new flows and options |
| Packaging        | Manual load (dev)                      | N/A     | Maintain             | Web Store process not in repo |
| Telemetry        | None                                   | N/A     | N/A                  | Preserve privacy stance unless explicitly required |

### New Technology Additions

No new technologies proposed until the enhancement is selected. If local rendering or caching is chosen, candidates include: KaTeX/MathJax (local), lightweight cache in `chrome.storage`, or a minimal service worker for caching and multi‑tab coordination.

> Validation checkpoint: This alignment favors maintaining the current stack and patterns, only introducing new tech when necessary for the chosen enhancement. Confirm this direction or call out constraints (e.g., no new permissions, no third‑party libs).

## Source Tree Integration

### Existing Project Structure (relevant parts)

```
TeX-for-Gmail/
├── manifest.json
├── src/
│   ├── content.js
│   ├── options.html
│   ├── options.js
│   └── styles.css
├── assets/
│   └── icons/
│       └── icon128.png
├── tests/
│   ├── test-inline-display.html (example)
│   └── test-story-4.3.html (example)
└── docs/
    ├── prd/
    ├── stories/
    └── architecture.md
```

### New File Organization (additions only; keep `src/` flat)

```
TeX-for-Gmail/
├── src/
│   ├── rendering-adapter.js       # Chooses local vs external renderer behind stable API
│   ├── render-external.js         # Extract current external render logic (CodeCogs/WP)
│   ├── render-local.js            # Local renderer stub (e.g., KaTeX/HTML) [TBD]
│   └── storage.js                 # Optional: extract StorageService for reuse
├── tests/
│   ├── test-local-rendering.html  # Harness for local rendering behavior [TBD]
│   └── test-fallbacks.html        # Harness for external fallback/server switching [TBD]
```

### Integration Guidelines
- File Naming: camelCase modules; `render-*.js` for renderer implementations; avoid directories in `src/`.
- Folder Organization: Keep `src/` flat per repo guidelines; no build system assumptions.
- Import/Export Patterns: Named exports for renderer functions; adapter provides a single entry (`renderEquation(latex, mode, opts)`).
- Minimal Refactor: Introduce adapter and `render-external.js` first; keep other logic in `content.js` initially. Extract `storage.js` only if needed by options/tests.

> Validation checkpoint: Proposed structure minimizes churn and follows existing flat `src/` pattern. Confirm acceptance or suggest constraints (e.g., avoid extracting StorageService).

## Enhancement Scope and Integration Strategy

> Define how the enhancement integrates with the existing MV3 extension. The specific enhancement is currently TBD and will be finalized with product input.

### Enhancement Overview
**Enhancement Type:** TBD (e.g., Hybrid Local Rendering with KaTeX + External Fallback)

**Scope:** TBD (affected areas likely include content script rendering pipeline, options UI, storage schema/versioning, and test harness pages)

**Integration Impact:** Medium–High (impacts rendering, options, and possibly permissions; no backend/database)

### Integration Approach
**Code Integration Strategy:**
- Maintain content-script–centric architecture; add modular rendering adapter layer (LocalRenderer | ExternalRenderer) behind a stable interface.
- Keep current external rendering path (CodeCogs/WordPress) for fallback; add local renderer module as first preference when enabled.
- Avoid background/service worker unless required for caching or multi-tab coordination (TBD based on enhancement choice).

**Database Integration:**
- Not applicable (no database in extension). If introducing structured cache, use `chrome.storage` with quotas and eviction policy.

**API Integration:**
- Retain current external API integration for fallback only; preserve existing rate-limit and server health logic.

**UI Integration:**
- Extend Options UI with toggles and parameters for the enhancement (e.g., “Use Local Rendering”, “Allow External Fallback”).
- Preserve current toggle button semantics in compose and reading modes.

### Compatibility Requirements
- Existing API Compatibility: Preserve current external rendering endpoints for fallback behavior.
- Database Schema Compatibility: N/A; if storage keys change, include versioned migration with defaults and rollback.
- UI/UX Consistency: Keep toolbar button, colors, and flows consistent; add settings non-intrusively.
- Performance Impact: Must sustain current responsiveness with 60+ equations; avoid long-blocking operations in content script.

> Validation checkpoint: Based on my analysis, this integration approach respects the existing extension patterns (content-script transforms, options-based configuration, external API fallback). Please confirm alignment and specify the exact enhancement so we can finalize scope and interfaces.

## Testing Strategy

### Integration with Existing Tests
- Existing Test Framework: Manual HTML harness pages under `tests/`
- Test Organization: Feature‑focused harnesses (compose, read mode, shortcuts, options)
- Coverage Requirements: Validate acceptance criteria for rendering, toggle, click‑to‑edit, server fallback, options persistence, and rate limiting

### New Testing Requirements (proposed)

Unit Tests for New Components
- Framework: N/A (no runner in repo); keep modules small and ad‑hoc testable in harness
- Location: `tests/test-local-rendering.html`, `tests/test-fallbacks.html`
- Coverage Target: Core rendering decisions, adapter selection, and storage migrations
- Integration with Existing: Harness pages load modules directly via `<script>`

Integration Tests
- Scope: Rendering adapter behavior, external fallback policy, server health switching, read‑mode overlay isolation
- Existing System Verification: Ensure compose toggle, click‑to‑edit, and template shortcuts remain intact
- New Feature Testing: Offline/simple‑math behavior, error handling UX, options toggles

Regression Testing
- Existing Feature Verification: Keyboard shortcuts, currency detection, code‑block protection
- Automated Regression Suite: Not in scope; rely on harness + concise QA checklist
- Manual Testing Requirements: Map PRD stories to harness sections; include repro steps in `tests/*`

## Security Integration

### Existing Security Measures
- Authentication: None (anonymous HTTP GET to external renderers when enabled)
- Authorization: N/A (extension‑local)
- Data Protection: LaTeX content is transmitted to third‑party services (see README privacy notice); no sensitive storage
- Security Tools: Chrome extension isolation; internal sanitization routines for HTML injection in Simple Math mode

### Enhancement Security Requirements
- New Security Measures: Prefer local rendering to avoid data egress; external fallback only if option enabled
- Integration Points: Rendering adapter enforces whitelist of external endpoints; sanitize all DOM insertions; avoid `innerHTML` where unsafe
- Compliance Requirements: Maintain least‑privilege permissions; no additional host permissions beyond Gmail; no `scripting` permission unless necessary
- CSP/Assets: If bundling KaTeX/MathJax, ship assets within the extension; avoid remote asset loading
- Network Policy: Enforce timeout/backoff; no arbitrary remote calls; restrict to known domains
- Storage/PII: No user PII; validate and clamp options; document any new keys and add versioned migration

### Security Testing
- Existing Security Tests: Manual validation via harness; confirm no rendering requests are sent when local‑only mode is enabled
- New Security Test Requirements: Domain allowlist checks; DOM injection safety (no `eval`, safe node creation); verify no network in offline scenarios
- Penetration Testing: Ad‑hoc review focused on Gmail DOM injection, content sanitization, and permission surface

## Next Steps

### Story Manager Handoff
Create a short brief for story planning:
- Reference: This architecture document (docs/architecture.md)
- Validated Integration Requirements: Maintain content‑script architecture, keep external fallback optional, flat `src/` structure
- Constraints: Privacy (avoid data egress by default), minimal permissions, performance with 60+ equations
- First Story Candidate: Introduce `rendering-adapter.js` and extract current external rendering to `render-external.js`; no behavior change

### Developer Handoff
Implementation prompt for first iteration:
- Reference coding standards in repo; keep `src/` flat
- Add `rendering-adapter.js` with `renderEquation(latex, mode, opts)` delegating to current external renderer
- Extract existing URL generation and server‑switch logic into `render-external.js` (pure functions)
- Wire adapter in `content.js` without altering user‑visible behavior; run harness pages to verify no regressions
