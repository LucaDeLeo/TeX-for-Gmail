# TeX for Gmail – src/content.js Unintended Behavior Analysis

Date: 2025-08-29
Scope: src/content.js (content script)

## Overview
This report documents observed and likely unintended behaviors in the content script. It summarizes root causes, user impact, and concrete fixes. It focuses on compose mode, read mode, send interception, rendering pipeline, and UI/state management.

## Summary (Top Findings)
- Missing functions referenced in code break “continuous mode” and restoration flows.
- Toggle state uses mixed types (boolean and strings), causing inconsistent behavior.
- Toolbar lookup mismatch prevents locating the right button in some flows.
- Read-mode overlay blocks pointer events, disabling interactions like Copy LaTeX.
- Send interception misses several LaTeX forms and relies on brittle UI labels.

## Detailed Findings

### 1) Missing functions (breaks continuous mode)
- References exist to undefined functions: `setupContentObserver`, `removeContentObserver`, `restoreOriginalContent`.
- Actual implemented counterparts: `setupAutoRenderObserver`, `performComprehensiveCleanup`, `restoreLatexSource`.
- Impact: Cmd/Ctrl+F8 or Cmd/Ctrl+F9 (continuous modes) will throw and silently fail; turning off continuous mode tries to call missing cleanup/restoration.
- Fix:
  - Replace calls with existing functions:
    - `setupContentObserver(...)` → `setupAutoRenderObserver(...)`
    - `removeContentObserver(...)` → use `performComprehensiveCleanup(...)` or disconnect the specific observer via `composeObservers`.
    - `restoreOriginalContent(...)` → `restoreLatexSource(...)`.

### 2) Toggle state uses mixed types (boolean vs enum)
- `getToggleState` defaults to `true` (boolean) when no state present.
- Other paths set state to strings like `'api' | 'simple' | 'off'` (e.g., continuous mode toggles).
- `toggleRendering` performs `!currentState` which is incorrect for strings.
- Impact: Visual state/UI gets out of sync; toggling flips to unintended values; continuous/one-time modes conflict.
- Fix:
  - Normalize on a single enum state: `'off' | 'api' | 'simple'`.
  - Update `getToggleState`, `setToggleState`, `toggleRendering`, and `detectAndRenderLatex` to rely on this enum.
  - Update `updateButtonVisualState` to render distinct styling for each state.

### 3) Toolbar lookup mismatch (compose vs read mode)
- Compose button stored in `composeButtons` keyed by `.aZ .J-J5-Ji / .J-Z-I / .gU .J-Z-I / [gh="tl"] .J-J5-Ji`.
- `toggleContinuousMode` locates toolbar via `.btC, .aaq, .aaZ` and then `composeButtons.get(toolbar)`. These don’t match how the Map is keyed.
- Impact: Fails to find the button; continuous toggle degrades into one-time render path.
- Fix:
  - Standardize the toolbar element used as the key (use same selection across add/toggle paths). Optionally keep a WeakMap from composeArea → button.

### 4) Read-mode overlay blocks user interaction
- CSS sets `.tex-read-overlay` and `.tex-read-overlay-content` to `pointer-events: none`, but attempts to re-enable on descendants (`.tex-math-*`). Since the parent is `none`, children cannot receive events.
- Impact: No hover/focus → Copy LaTeX button or custom context menu won’t work on rendered math in read mode.
- Fix:
  - Allow events on overlay content: remove `pointer-events: none` on the parent container, or split overlay into two layers so math stays interactive while original content stays visually hidden.

### 5) Send interceptor gaps and brittleness
- LaTeX detection only checks for `$...` and `$$...$$` in send flow.
  - Misses `\(...\)`, `\[...\]`, and theorem-like blocks.
- Button detection relies on `data-tooltip`, `aria-label`, or text containing “Send”. This can fail under other locales or DOM changes.
- `renderAndWaitForImages` sets toggle `true` but doesn’t restore the original toggle post-send.
- Impact: Emails may send without rendering even when users expect a prompt; state remains ON unintentionally.
- Fix:
  - Expand send detection regex to include `\(...\)` and `\[...\]` (and optionally theorem env).
  - Prefer structural detection (nearest compose container → send control) over tooltip/text matching; keep i18n-agnostic.
  - After programmatic send, restore toggle to original value and clean temporary observers.

### 6) Pattern detection and edge cases
- Regex `(?<!\$)\$...\$` uses negative lookbehind—fine in Chromium, but brittle in alternative engines (test harnesses).
- Currency avoidance: Good heuristics; however, inline detection calls `isCurrency(match[0])` (the matched `$...$`, not the inner group). This is okay but worth confirming against edge cases.
- Naive TeX mode only runs if no formal LaTeX matches exist; mixed content could produce surprising behavior.
- Fix:
  - Keep current Chromium-targeted regex; document engine assumptions in code comments.
  - Consider refining currency checks if false negatives surface.
  - Optionally allow naive matches alongside formal ones where non-overlapping.

### 7) UI/visual state inconsistencies
- Continuous-mode paths directly mutate styles/`aria-pressed` without using `updateButtonVisualState`, causing label/background drift.
- `button.style.display = 'inline-flex !important'` has no effect for `!important` in JS.
- Impact: Users see stale “TeX OFF” text with active state or vice versa.
- Fix:
  - Route all visual updates through `updateButtonVisualState` and/or shared helpers; move `!important` into CSS if needed.

### 8) Cursor preservation caveats
- Absolute-offset approach treats math nodes as lengths based on source + delimiter counts; can still jump the caret in complex DOM.
- Impact: Occasionally surprising cursor jumps on long bodies or mixed node trees.
- Fix:
  - Acceptable for now; consider a more DOM-anchored caret mapping if reports persist.

### 9) Copy LaTeX UX robustness
- Single global “Copy LaTeX” button is reparented; rapid hover may flicker. There’s no hide debounce.
- Combined with read-mode overlay pointer issue, functionality seems broken in read mode.
- Fix:
  - Add a short hide debounce; ensure overlay interaction is enabled (see Finding #4).

### 10) Settings and storage polish
- Server preference migration between `sessionStorage` and `chrome.storage` can momentarily disagree across tabs.
- Font allowlist is strict; many user-provided fonts map to “serif”, looking broken.
- Fix:
  - Consider tab broadcast (runtime.onMessage) upon migration.
  - Loosen font validation or make allowlist configurable.

## Recommended Fix Plan (Priority)

### P0 – Correct broken references and state model
- Replace missing function calls:
  - `setupContentObserver` → `setupAutoRenderObserver`.
  - `removeContentObserver` → targeted observer disconnect or `performComprehensiveCleanup`.
  - `restoreOriginalContent` → `restoreLatexSource`.
- Unify toggle state as enum `'off' | 'api' | 'simple'` and update:
  - `getToggleState`, `setToggleState`, `toggleRendering`, `detectAndRenderLatex`, `updateButtonVisualState`.
- Standardize toolbar keying so `toggleContinuousMode` finds the same button stored by `addTexButton`.

### P1 – Read-mode and send reliability
- Overlay: allow pointer events on math; keep original text visually hidden but not blocking interactions.
- Send:
  - Expand LaTeX detection to include `\(...\)` and `\[...\]` (and optionally theorem env).
  - Use structural detection for the active compose/send rather than tooltip/text.
  - Restore original toggle state after programmatic send.

### P2 – UX and resilience
- Route all button/label changes through `updateButtonVisualState`.
- Remove `!important` from inline style assignments; move to stylesheet if needed.
- Add small hide debounce for Copy UI; ensure context menu works with keyboard in read mode.
- Document Chromium regex assumptions; revisit currency/naive-TeX interplay if user reports continue.

## Test Suggestions
- Continuous mode
  - Cmd/Ctrl+F8 and Cmd/Ctrl+F9: ensure observer attaches, renders on edits, toggles off cleanly, and UI reflects state.
- Send flow
  - Bodies containing `$...$`, `\(...\)`, `\[...\]`, theorem blocks; confirm dialog/behavior per settings.
  - Simulate server failures to validate fallback and state restoration after send.
- Read mode
  - Validate overlay interactions (Copy button, Shift+F10 menu) and that original content remains untouched.
- Currency heuristics
  - `$9.99`, `$10-$20`, `$5 each` should not render; `$1 + 1 = 2$` should render.

## Notes
- The code already includes robust storage validation, server health monitoring, and cursor preservation. The main functional gaps are the broken references, state-type inconsistency, and overlay interactivity.

---
Maintainer notes: If you want, I can implement P0 (broken references + unified toggle) in a focused PR and follow with P1 adjustments.

