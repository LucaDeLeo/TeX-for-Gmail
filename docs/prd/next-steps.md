# Next Steps

## UX Expert Prompt
Use this PRD to validate UI flows for compose/read modes and refine accessibility to WCAG AA.

## Architect Prompt
Confirm content-script architecture, finalize fallback/timeout handling, and verify storage/event flows.

## Actionable Checklist
- Reliability: Add per-image load timeout (4–6s) and single-retry fallback (CodeCogs → WordPress), gated by `serverFallback` setting; show toasts on fallback/degrade.
- DPI Compliance: Set defaults to Inline 200 / Display 300 across `src/content.js`, `src/options.js`, and `src/options.html`; ensure storage change listeners update runtime values.
- Display Math Correctness: Prevent stray `$$` artifacts; ensure processed/error nodes aren’t reprocessed; add regression test page covering mixed inline/display.
- Baseline Alignment: Tune inline images to `vertical-align: -0.2em` and re-verify in inline text contexts.
- Delimiters/Currency: Add tests for `\(...\)`, `\[...\]`; verify currency exclusions (`$9.99`, `$1,000`, `$5M`) while allowing `$1 + 1 = 2$`.
- Persistence/Shortcuts: Verify `chrome.storage` persistence and keyboard shortcuts (F8/F9, Cmd/Ctrl variants) in live Gmail compose/read.
- QA + Release: Run manual/Playwright checks in Gmail, update README/CHANGELOG, bump version, and tag release.

## Acceptance Gates
- Fallback/Timeout: On simulated CodeCogs failure, WordPress fallback succeeds within ≤ 12s total; user sees fallback toast; no thrashing between servers.
- DPI: Default image URLs include `\\dpi{200}` (inline) and `\\dpi{300}` (display); changing sliders reflects in subsequent renders without reload.
- Display Correctness: For inputs with `$$…$$`, output has a single display wrapper and no literal `$$` siblings; bracket variants behave equivalently.
- Baseline: Inline `x^2` aligns within ±3px of surrounding baseline at 16px body font in visual diff.
- Currency/Delimiters: Currency examples are not rendered; escaped dollars `\$` show as `$`; `\(...\)` and `\[...\]` pass tests.
- Persistence/Shortcuts: Settings persist across sessions and tabs; shortcuts operate in Gmail without conflicting with native shortcuts, and respect the enable/disable setting.
