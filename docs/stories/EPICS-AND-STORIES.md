# Epics and Stories — Reformatted

This document consolidates stories into Epic sections using the template structure: “Epic {{number}} {{title}}” and “Story {{epic}}.{{story}} {{title}}” with numbered acceptance criteria.

## Epic 1 Foundation & Core Integration

Goal: Establish the Chrome extension, integrate with Gmail UI, and enable initial LaTeX rendering and user control.

### Story 1.1 Core Extension Setup & Gmail Integration
Status: Done

Acceptance Criteria
1. Manifest V3 extension configured with minimal permissions and Gmail host permissions.
2. Content script injects on mail.google.com and initializes reliably.
3. TeX button appears in Gmail compose toolbar.
4. Button click detects compose area and confirms via log.
5. Project structure follows MV3 best practices.

### Story 1.2 LaTeX Detection and CodeCogs Rendering Pipeline
Status: Done

Acceptance Criteria
1. Detect `$...$` inline math and `$$...$$` display math.
2. Validate LaTeX and construct CodeCogs render URLs.
3. Replace text with rendered images preserving alt text.
4. Basic error handling when render fails.
5. Debounced processing for performance.

### Story 1.3 Toggle Control and User Interaction
Status: Done

Acceptance Criteria
1. Toggle ON/OFF per compose window; state reflected by button.
2. Restores source when toggling OFF; re-renders when toggling ON.
3. Preserves cursor position during toggle and render.
4. Cleans up observers/timeouts when compose is closed.
5. Handles multiple compose windows independently.

## Epic 2 Stability & Quality

Goal: Resolve critical UX stability issues and ensure robust source preservation.

### Story 2.1 Critical Bug Fixes — Cursor Preservation and Memory Management
Status: Done

Acceptance Criteria
1. Cursor position preserved through toggles and renders.
2. No text deletion/corruption during operations.
3. No memory leaks; observers/timeouts cleaned up.
4. Race conditions removed in handlers and observers.
5. Stable operation across multiple compose windows and long sessions.

### Story 2.2 Self-Documenting LaTeX Images with Attribute-Based Source Storage
Status: Done

Acceptance Criteria
1. Rendered images store source in `alt` and `data-latex` attributes.
2. Click-to-edit recovers exact original LaTeX including delimiters.
3. Fallback attributes used when `dataset` unsupported.
4. Tooltips and ARIA attributes improve usability/accessibility.
5. Error path preserves original source visibly.

## Epic 3 Enhanced Rendering & LaTeX Support

Goal: Correct rendering modes, expand pattern support, and provide Simple Math mode.

### Story 3.1 Fix Core Rendering Issues & Multi-Mode System
Status: Completed — Production Ready

Acceptance Criteria
1. Correct inline vs display handling (`$...$` vs `$$...$$`).
2. DPI defaults aligned to PRD (Inline 200+, Display 300+).
3. Baseline alignment improved for inline images.
4. Simple Math mode for offline HTML/CSS rendering.
5. Server fallback between CodeCogs and WordPress with graceful degradation.

### Story 3.2 Extended LaTeX Patterns & Features
Status: Done — Passed QA Review (with fixes)

Acceptance Criteria
1. Support `\(...\)` and `\[...\]` delimiters.
2. Abbreviation expansion (e.g., `\bA → \mathbb A`).
3. Theorem environment wrappers with color themes.
4. Trailing-space protection; currency exclusion heuristics.
5. No overlap conflicts between inline and display detection.

## Epic 4 User Control & Polish

Goal: Provide user preferences, shortcuts, and reading mode; complete feature parity improvements.

### Story 4.1 Options Page & Preferences
Status: Done

Acceptance Criteria
1. Options UI for server selection and fallback toggle.
2. DPI sliders with defaults Inline 200, Display 300 (range 100–400).
3. Font settings for Simple Math outgoing/incoming.
4. Button visibility toggles; enable/disable keyboard shortcuts.
5. Send behavior preference: Always/Never/Ask.

### Story 4.2 Keyboard Shortcuts & Reading Mode
Status: Approved

Acceptance Criteria
1. F8/F9 one-shot render; Cmd/Ctrl+F8/F9 continuous modes.
2. Reading mode: render LaTeX in received emails via toolbar/menu.
3. Shortcuts respect settings; no conflicts with Gmail shortcuts.
4. Works across compose and reading contexts.

### Story 4.3 Feature Parity — Click-to-Edit, TeX Shortcuts & UI Settings
Status: Done

Acceptance Criteria
1. Click-to-edit on rendered images to restore source.
2. Ctrl+Shift template shortcuts (fraction, sqrt, integral, matrix, etc.).
3. Options toggles for Naive TeX and Simple Math with persistence.
4. Integration with continuous modes and settings changes.

### Story 4.4 Settings Import/Export (Options Page)
Status: Done

Acceptance Criteria
1. Export settings to JSON with `_meta` (manifest version, exportedAt ISO8601 UTC) and recognized `settings` keys; correct filename pattern.
2. Import settings via file picker with validation, sanitization, and inline preview (Apply/Cancel) and focus management.
3. No network calls or new permissions; data only committed on explicit Apply.
4. Accessible controls and messaging; help text included.
5. Post-apply, settings propagate to content scripts; no regression to existing Options behaviors.

### Story 4.5 Copy LaTeX Source & Context Menu
Status: Done

Acceptance Criteria
1. Copy LaTeX available via hover button and right‑click menu on equations; copies exact original with delimiters.
2. Keyboard accessible; announcements via aria‑live/toast; no interference with click‑to‑edit.
3. Works for Rich Math (images) and Simple Math; uses stored `alt`/`data-latex`.
4. Options toggle to show/hide Copy control; no new permissions; no network calls.
5. Efficient and non-intrusive UI; handles 100+ equations without lag.

## Epic 5 Critical Bug Fixes & Stability

Goal: Address critical bugs identified in content.js behavior analysis to restore broken functionality and improve reliability.

### Story 5.1 Fix Missing Functions & Unified Toggle State Model
Status: Done (Resolved via refactoring)
**Note**: Original line references (3709+) outdated after file refactoring from 3700+ to 2431 lines

Acceptance Criteria
1. Replace all broken function references with correct implementations (setupContentObserver → setupAutoRenderObserver, etc.).
2. Implement unified toggle state as enum `'off' | 'api' | 'simple'` across all functions.
3. Standardize toolbar element keying so toggleContinuousMode finds buttons correctly.
4. Cmd/Ctrl+F8 and Cmd/Ctrl+F9 successfully enable continuous modes without errors.
5. Toggle button visual state always matches actual rendering state.
6. No console errors when switching between rendering modes.

### Story 5.2 Fix Read-Mode Overlay Interaction & Send Detection
Status: Done

Acceptance Criteria
1. Read-mode overlay allows pointer events on math elements (Copy LaTeX, context menu).
2. Send detection expanded to include `\(...\)` and `\[...\]` patterns.
3. Send button detection uses structural DOM navigation instead of text/tooltip matching.
4. Original toggle state restored after programmatic send completion.
5. Send dialog appears consistently for all LaTeX pattern types per user settings.

### Story 5.3 UI State Consistency & Visual Polish
Status: Done
**Debounce timing**: 150ms recommended for hover interactions

Acceptance Criteria
1. All button/label state changes route through updateButtonVisualState.
2. CSS !important declarations moved from JavaScript to stylesheets.
3. Copy LaTeX button includes hide debounce to prevent flicker.
4. Code comments document Chromium-specific regex requirements.
5. Currency detection handles edge cases correctly ($9.99 vs $1 + 1 = 2$).

### Story 5.4 Storage Migration & Font Validation Improvements
Status: Done
**Font allowlist**: Expanded from 20 to 60+ fonts

Acceptance Criteria
1. Storage migration synchronized across all tabs via runtime.onMessage.
2. Font validation expanded to support more user-provided fonts.
3. Settings changes apply immediately without page reload.
4. Storage operations include proper error handling and retry logic.
5. Migration state tracked to prevent duplicate migrations.

### Story 5.5 Comprehensive Testing & QA Validation
Status: Done
**Performance benchmark**: <500ms for 100 equations

Acceptance Criteria
1. All P0 fixes validated (continuous modes, toggle consistency, toolbar discovery).
2. All P1 fixes validated (read-mode interactions, send detection, state restoration).
3. All P2 enhancements validated (UI consistency, no flicker, settings sync).
4. Performance benchmarks met (no leaks, <500ms renders, no blocking).
5. Cross-browser/environment testing passed (Chrome/Edge/Brave, all Gmail themes).
