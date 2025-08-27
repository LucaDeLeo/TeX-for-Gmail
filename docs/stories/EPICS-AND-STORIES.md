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
Status: Ready for Review

Acceptance Criteria
1. Click-to-edit on rendered images to restore source.
2. Ctrl+Shift template shortcuts (fraction, sqrt, integral, matrix, etc.).
3. Options toggles for Naive TeX and Simple Math with persistence.
4. Integration with continuous modes and settings changes.

