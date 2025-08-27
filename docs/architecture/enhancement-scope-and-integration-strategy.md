# Enhancement Scope and Integration Strategy

> Enhancement defined: Complete outstanding PRD v3.0 compliance items per `test-report-prd-compliance.md` while preserving the current MV3 content‑script architecture and least‑privilege permissions.

## Enhancement Overview
**Enhancement Type:** PRD Compliance Completion (Reliability + Correctness)

**Scope:**
- Rendering reliability: Detect timeouts/errors and auto‑fallback to WordPress; add retry/backoff windows; keep rate limiting.
- Display math correctness: Fix duplicate `$$`/escaping issues; normalize delimiters; ensure proper `\\displaystyle` usage only for display mode.
- DPI alignment: Set inline DPI default to 200 (from 110) and ensure options are respected for inline/display.
- Delimiter coverage: Verify and, if needed, add support for `\(...\)` and `\[...\]` patterns.
- Currency/spacing: Ensure currency detection and trailing‑space protections are applied consistently.
- Storage robustness: Operate safely when `chrome.storage` is unavailable; preserve defaults; avoid crashes in test envs.
- Baseline alignment: Adjust CSS or inline styles to maintain visual baseline for inline images.
- Harness coverage: Add focused tests for fallback, display math, delimiters, DPI, and currency detection.

**Integration Impact:** Medium (localized to rendering pipeline, error handling, and options defaults; no backend/database; no new permissions)

## Integration Approach
**Code Integration Strategy:**
- Minimal‑churn fixes within `src/content.js` for detection/normalization, DPI defaults, and robust fallback logic (timeouts + onerror handlers).
- Optional refactor: Introduce `rendering-adapter.js` and extract external URL generation to `render-external.js` if doing so reduces risk; otherwise defer until after compliance is achieved.
- Normalize detection: Strip delimiters before sending to external renderers; ensure we only inject rendered nodes without duplicating raw delimiters in DOM.
- Fallback control: Implement Promise‑based image load with timeout; on timeout or error, increment server health and switch safely; display non‑blocking toast.

**Database Integration:**
- N/A. If adding a tiny render cache later, use `chrome.storage` with quota‑aware eviction; out‑of‑scope for compliance phase.

**API Integration:**
- Retain existing endpoints (CodeCogs primary, WordPress fallback). Add timeouts and backoff. Keep rate limiting and health counters.

**UI Integration:**
- Align default DPI values in Options with engine defaults; ensure reads/writes round‑trip to `chrome.storage`.
- Expose fallback enable/disable toggle if not already present; default to enabled.
- Preserve toolbar toggle and shortcut semantics.

## Compatibility Requirements
- Existing API Compatibility: Preserve current external rendering endpoints for fallback behavior.
- Database Schema Compatibility: N/A; if storage keys change, include versioned migration with defaults and rollback.
- UI/UX Consistency: Keep toolbar button, colors, and flows consistent; add settings non‑intrusively.
- Performance Impact: Maintain responsiveness with 60+ equations; avoid blocking the compose thread; debounce stays at 500ms for rendering.

> Validation checkpoint: This integration approach targets the exact gaps listed in `test-report-prd-compliance.md` while respecting current extension patterns. Confirm if any items should be deferred or treated as out‑of‑scope for this enhancement.
