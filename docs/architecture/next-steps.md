# Next Steps

## Story Manager Handoff
Brief for PRD Compliance Completion:
- Reference: `docs/architecture/` (this shard set) and `test-report-prd-compliance.md`
- Integration Requirements: Maintain content‑script architecture; preserve external endpoints; keep permissions minimal
- Constraints: No new host permissions; prioritize privacy; avoid service worker unless later needed
- Success Metric: Raise PRD compliance to ≥90% with all critical items passing

Suggested Story Sequence
1) Reliability: Implement timeout‑driven fallback to WordPress with health counters and non‑blocking toasts; add `tests/test-fallbacks.html`.
2) Display Math: Normalize delimiters; fix duplicate `$$`; ensure `\\displaystyle` only for display; add `tests/test-display-math.html`.
3) DPI Defaults: Set inline DPI default to 200; ensure options apply to runtime; add `tests/test-dpi-and-baseline.html`.
4) Delimiters & Currency: Verify `\(...\)` and `\[...\]` support; ensure currency/trailing‑space protections; add `tests/test-delimiters.html` and `tests/test-currency-spacing.html`.
5) Baseline Alignment: Adjust CSS for inline images to align with text baseline; verify in harness.

## Developer Handoff
Implementation guidance for Story 1 (Reliability):
- Add a Promise wrapper around image rendering with a 4–6s timeout; on timeout/error, increment health and call safe server switch; show info toast.
- Ensure fallback attempts once per render action; honor existing rate limit; keep UI responsive.
- Guard `chrome.storage` calls in tests; ensure default settings are applied when storage unavailable.
- Validate with `tests/test-fallbacks.html`; confirm report failures turn into PASS.

Implementation guidance for Story 2 (Display Math):
- Ensure detection strips delimiters before sending to renderer; inject rendered node without duplicating delimiters.
- Apply `\\displaystyle` prefix only for display equations.
- Validate with `tests/test-display-math.html`.
