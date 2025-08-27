# Requirements

## Functional (FR)
- FR1: Detect inline math using `$...$`.
- FR2: Detect display math using `$$...$$`.
- FR3: Detect inline math using `\(...\)`.
- FR4: Detect display math using `\[...\]`.
- FR5: Process edits in near real time with ~500ms debounce.
- FR6: Validate patterns (no line breaks inside delimiters).
- FR7: Exclude currency-like patterns (e.g., `$100`, `$5.99`).
- FR8: Reject LaTeX with leading/trailing spaces inside delimiters.
- FR9: Rich Math mode: render images via external servers (CodeCogs primary, WordPress fallback).
- FR10: Simple Math mode: render with HTML/CSS for offline use.
- FR11: Naive TeX detection (optional) for `x^2`, `a_n`, `e^(iπ)`.
- FR12: Abbreviation expansion (e.g., `\bR → \mathbb R`).
- FR13: Theorem-like environment wrappers with color themes.
- FR14: Click-to-edit restores original LaTeX source from rendered images.
- FR15: Options page to configure server, DPI, fonts, visibility, shortcuts.
- FR16: Keyboard shortcuts: F8/F9 one-shot; Cmd/Ctrl+F8/F9 continuous.
- FR17: Reading mode rendering via button and Gmail “More” menu option.
- FR18: Server fallback with per-image timeout (4–6s) and single retry.
- FR19: Send behavior control (Always/Never/Ask) with confirmation dialog.

## Non Functional (NFR)
- NFR1: Render time target p95 < 500ms after debounce.
- NFR2: API rate limit ≤ 60 calls per minute.
- NFR3: Memory usage < 50MB during active use.
- NFR4: CPU usage < 5% while idle; efficient DOM observers.
- NFR5: HTTPS-only calls to external services.
- NFR6: Minimal permissions (activeTab, storage, host permissions for Gmail).
- NFR7: Privacy notice: LaTeX content sent to external services in Rich Math.
- NFR8: Compatibility: Chrome 88+ (MV3), new Gmail UI.
- NFR9: Reliability: server fallback, graceful degradation, error recovery.
- NFR10: Accessibility: aim for WCAG AA for options UI and interactions.
