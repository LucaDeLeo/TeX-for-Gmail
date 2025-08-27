# Sprint Change Proposal — TeX for Gmail

Date: 2025-08-27
Prepared by: Bob (sm — Scrum Master)

## Change Trigger
- PRD v3.0 compliance test report shows 65% compliance with critical gaps:
  - CodeCogs API timeouts and missing automatic server fallback.
  - Display math rendering issues (duplicate `$$` artifacts/escaping).
  - DPI defaults not aligned with PRD (inline below 200; display OK at 300).
  - Baseline alignment/usability issues for inline math images.
  - Settings persistence unverified in simulated environment; toolbar visibility inconsistent in Gmail UI.

## Goal and Success Criteria
- Restore reliable, accurate LaTeX rendering in Gmail compose/read.
- Reach 85–90% PRD compliance for tested features.

Success criteria:
- Automatic fallback to backup server after primary failure (≤ 1 retry; ≤ 6s timeout per attempt) with user feedback.
- Clear separation: `$…$` inline vs `$$…$$` display; no stray delimiters in output; bracket variants `\(...\)`, `\[...\]` supported.
- Defaults: DPI inline = 200+, display = 300+; applied consistently via options and content.
- Inline images align visually with text baseline (verified by screenshot diff test).
- Settings changes apply live; persistence works in real Gmail session.

## Impact Analysis
- Epics/Stories affected:
  - Story 3.1 Fix Core Rendering: fallback, DPI, baseline, delimiter correctness.
  - Story 4.1 Options & Preferences: defaults, storage application, live updates.
  - Story 4.2 Keyboard Shortcuts: end-to-end execution verification (no code changes expected).
  - Story 4.3 Feature Parity: click-to-edit behavior confirmed.
- Artifacts impacted:
  - `src/content.js`: server fallback, timeouts/retries, DPI application, display-math parsing, baseline CSS.
  - `src/options.js`, `src/options.html`: defaults and slider values.
  - Tests under `tests/`: add/extend coverage for fallback, DPI, delimiters, baseline.
  - Docs: README, CHANGELOG, and QA reports alignment.

## Options Considered
1) Switch primary renderer to WordPress (WP.com) permanently.
   - Pros: Often more reliable; simple.
   - Cons: Different rendering style; external dependency shift; not PRD-aligned (PRD permits multi-server with fallback).
2) Keep CodeCogs primary with robust fallback to WP and graceful degradation to Simple Math.
   - Pros: PRD-aligned; best of both worlds; resilient.
   - Cons: Slightly more logic; needs careful rate limiting.

Decision: Option 2 (primary CodeCogs, automatic fallback to WP, degrade to Simple Math as last resort).

## Proposed Updates (Drafted Edits)

1) Reliability — Server Fallback, Timeouts, Retries (content.js)
- Add per-image load timeout (4–6s) and a single retry on alternate server if `onload` not fired within timeout or `onerror` fires.
- Respect `settings.serverFallback === true` before switching servers.
- Reset server health counters on successful loads; use mutex to avoid thrashing (already present).
- Show toasts on fallback/degradation (“Switching to backup server…”, “Using offline rendering…”).

2) Display Math Correctness (content.js)
- Ensure detection pipeline removes delimiters from rendered output and never re-inserts `$$` as text.
- Prevent reprocessing of `.tex-render-error` and processed nodes; maintain parent processing flags (already partially implemented) and extend tests to catch regressions.

3) DPI Compliance (content.js, options.js/html)
- Defaults:
  - `CONFIG.dpi.inline = 200` (from 110)
  - `CONFIG.dpi.display = 300`
  - `DEFAULT_SETTINGS.dpiInline = 200`, `DEFAULT_SETTINGS.dpiDisplay = 300`
  - Update options sliders default values and visible labels to match.
- URL generation: keep `\\displaystyle` for display; no prefix (or `\\textstyle`) for inline.

4) Inline Baseline Alignment (content.js)
- Keep wrapper `inline-block` and image `display:inline`.
- Adjust `img.style.verticalAlign` for inline to `-0.2em` for improved baseline; allow tuning later.

5) Delimiters, Currency, Trailing Space (content.js + tests)
- Verify `\(...\)` and `\[...\]` variants work (patterns exist; add tests).
- Keep currency exclusion heuristics; add tests for `$9.99`, `$1,000`, `$5M` while allowing `$1+1=2$`.
- Maintain trailing-space protection (`latex.trim() === latex`).

6) Persistence and Shortcuts (options/content + QA)
- Keep sync→local fallback; in test contexts lacking `chrome.storage`, surface a non-blocking warning toast.
- Validate F8/F9 and Ctrl/Cmd+F8/F9 paths in live Gmail.

## Acceptance Criteria (Per Work Item)
- Fallback/Timeout: Given CodeCogs timeout, then WP attempt succeeds and image renders within ≤ 12s total; a toast indicates fallback; setting can disable fallback.
- Display correctness: For input with `$$…$$`, output contains one `.tex-math-display` node, no literal `$$` text siblings; `\[...\]` equivalent.
- DPI: When defaults untouched, image URLs include `\\dpi{200}` for inline and `\\dpi{300}` for display; changing sliders updates subsequent renders.
- Baseline: Inline `x^2` visually aligns within ±3px of adjacent baseline in 16px body font (screenshot diff threshold).
- Currency: `$9.99` remains plain text; `$a_n$` renders; `\$` preserved as `$`.
- Persistence: Changing options updates content without reload; settings persist across sessions in real Gmail.

## Test Plan
- Expand `tests/test-inline-display.html` to include bracket variants and currency cases.
- Add `tests/test-server-fallback.html` simulating failure (force bad host), asserting fallback behavior and final render node presence.
- Add minimal screenshot-based baseline check (manual or Playwright note).
- Exercise `tests/test-codecogs-api.html` to confirm prefix logic and DPI in URLs.

## Risks and Mitigations
- External API instability: Add retry/backoff and clear UX messaging.
- Gmail DOM changes: Use resilient selectors and cleanup guards (already present).
- Over-fallback thrash: Mutex + failure thresholds prevent rapid toggling.

## Execution Plan (2–3 working days)
1. Implement fallback + timeout + respect setting; add targeted tests.
2. Align DPI defaults across content/options; verify application in URL generation and options listeners.
3. Fix display-math duplication edge cases; add regression test.
4. Tune baseline alignment CSS; verify visually.
5. QA in Gmail (compose/read + send interceptor); update README/CHANGELOG.

## Required Approvals
- Approve proposed defaults (inline 200 DPI, display 300 DPI).
- Approve fallback behavior (1 retry, ≤ 6s timeout per server).
- Approve baseline alignment adjustment to `vertical-align: -0.2em`.

---
Notes:
- This proposal follows the `.bmad-core/tasks/correct-course.md` guidance to consolidate change analysis and concrete edits for review.

