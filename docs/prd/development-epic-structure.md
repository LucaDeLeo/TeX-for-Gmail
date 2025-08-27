# 📘 Development Epic Structure

## Epic TEX-002: Enhanced Rendering & LaTeX Support
**Sprint:** 2025-Q4-S1  
**Status:** Planned  
**Goal:** Fix critical rendering issues and expand capabilities with multiple modes and comprehensive LaTeX pattern support

### User Stories:

**Story 3.1: Fix Core Rendering Issues & Multi-Mode System**
- **CRITICAL:** Fix low DPI issue - increase to 200+ (inline) and 300+ (display)
- **CRITICAL:** Fix inline vs display mode - proper `$` vs `$$` handling with correct LaTeX modes
- **CRITICAL:** Fix baseline alignment for inline equations
- Implement Simple Math (HTML-based offline rendering)
- Implement Guess Naive TeX (auto-detect informal math)
- Add WordPress as fallback server with auto-switching
- Server health monitoring and graceful degradation
 - Add per-image load timeouts and single-retry fallback policy

**Story 3.2: Extended LaTeX Patterns & Features**
- Support \(...\) and \[...\] delimiters
- Implement abbreviation system (\bA → \mathbb A, etc.)
- Add theorem environments with color themes
- Handle trailing spaces and currency exclusion properly
- Ensure proper inline/display distinction for all pattern types

## Epic TEX-003: User Control & Polish
**Sprint:** 2025-Q4-S2  
**Status:** Planned  
**Goal:** Give users control over the extension behavior and improve UX

### User Stories:

**Story 4.1: Options Page & Preferences**
- Create options.html with settings UI
- Implement Chrome storage API for preferences
- **CRITICAL:** Add send behavior preference (always render, never render, ask)
- Add popup dialog for "ask on send" option
- Add server selection, magnification, font customization
- Button visibility controls for compose/read modes
- DPI customization settings for image quality

**Story 4.2: Keyboard Shortcuts & Reading Mode**
- Implement F8/F9 for once rendering
- Implement Cmd+F8/F9 for continuous rendering
- Add "More" menu integration for reading emails
- Ensure all modes work in both compose and read contexts

## Implementation Notes:
- **Priority:** Story 3.1 should be implemented first to fix critical user-reported issues
- Each story delivers meaningful user value independently
- Stories build on the completed TEX-001 MVP foundation
- Total scope: 4 stories across 2 sprints
- Maintains backward compatibility with existing functionality
- Critical fixes (DPI, inline/display, send behavior) take precedence over new features
