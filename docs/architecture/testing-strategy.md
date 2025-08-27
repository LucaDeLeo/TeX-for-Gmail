# Testing Strategy

## Integration with Existing Tests
- Existing Test Framework: Manual HTML harness pages under `tests/`
- Test Organization: Feature‑focused harnesses (compose, read mode, shortcuts, options)
- Coverage Requirements: Validate acceptance criteria for rendering, toggle, click‑to‑edit, server fallback, options persistence, and rate limiting

## New Testing Requirements (PRD Compliance)

Unit‑Style Harness Scenarios
- Framework: N/A (no runner in repo); use focused harness pages
- Locations (proposed):
  - `tests/test-fallbacks.html` — Simulate CodeCogs timeouts and verify WordPress fallback + toast
  - `tests/test-display-math.html` — Verify display correctness (no duplicate `$$`, proper centering)
  - `tests/test-delimiters.html` — Verify `$...$`, `$$...$$`, `\(...\)`, `\[...\]`
  - `tests/test-currency-spacing.html` — Ensure `$100` not rendered; trailing‑space protection
  - `tests/test-dpi-and-baseline.html` — Confirm inline DPI 200 default and baseline alignment
- Coverage Target: Rendering decisions, fallback policy, DPI, delimiter normalization, currency detection
- Integration with Existing: Harness pages load modules/content script via `<script>` where feasible

Integration Tests
- Scope: End‑to‑end rendering in compose/read harness; server health switching after N failures; options persistence round‑trip
- Existing System Verification: Ensure compose toggle, click‑to‑edit, and template shortcuts remain intact
- New Feature Testing: Error handling UX, toasts, and fallback toggles

Regression Testing
- Existing Feature Verification: Keyboard shortcuts, currency detection, code‑block protection
- Automated Regression Suite: Not in scope; rely on harness + concise QA checklist
- Manual Testing Requirements: Map PRD stories to harness sections; include repro steps in `tests/*`

## PRD Compliance Catch‑Up Plan
- Source of truth: `test-report-prd-compliance.md`
- Targeted closures:
  - Fix API fallback and timeouts → expect PASS for “Rich Math Mode” and “Server Fallback”
  - Fix display math duplication → expect PASS for display block rendering
  - Align inline DPI to 200 default → expect PASS for DPI resolution
  - Verify `\(...\)` and `\[...\]` → move from UNKNOWN to PASS
  - Validate currency/trailing‑space → move from UNKNOWN to PASS
- Exit criteria: Re‑run the report steps manually; update test report to ≥90% compliance
