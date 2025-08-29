# Epic 5: Bug Fix Report to Story Mapping

## Overview
This document maps the issues identified in `/docs/reports/content-js-unintended-behavior.md` to the stories created in Epic 5.

## Priority Mapping

### P0 - Critical Issues → Story 5.1
**Report Findings:**
- Finding #1: Missing functions (setupContentObserver, removeContentObserver, restoreOriginalContent)
- Finding #2: Toggle state mixed types (boolean vs enum)
- Finding #3: Toolbar lookup mismatch

**Story 5.1: Fix Missing Functions & Unified Toggle State Model**
- Replaces broken function references
- Unifies toggle state to enum model
- Standardizes toolbar element keying
- Restores continuous mode functionality

### P1 - Major Issues → Story 5.2
**Report Findings:**
- Finding #4: Read-mode overlay blocks pointer events
- Finding #5: Send interceptor gaps and brittleness

**Story 5.2: Fix Read-Mode Overlay Interaction & Send Detection**
- Fixes overlay pointer-events blocking
- Expands LaTeX pattern detection for send
- Improves send button detection reliability
- Restores toggle state after send

### P2 - Enhancements → Stories 5.3 & 5.4
**Report Findings:**
- Finding #7: UI/visual state inconsistencies
- Finding #9: Copy LaTeX UX robustness
- Finding #10: Settings and storage polish
- Finding #6: Pattern detection edge cases

**Story 5.3: UI State Consistency & Visual Polish**
- Centralizes UI state management
- Fixes !important usage in JavaScript
- Adds Copy button debouncing
- Documents regex assumptions
- Improves currency detection

**Story 5.4: Storage Migration & Font Validation**
- Synchronizes storage across tabs
- Loosens font validation
- Improves settings propagation

## Additional Coverage

### Story 5.5: Comprehensive Testing & QA Validation
- Validates all fixes work together
- Performance benchmarking
- Cross-browser testing
- Integration testing

## Implementation Order
1. **Story 5.1** (P0) - Must be done first as it fixes core functionality
2. **Story 5.2** (P1) - Depends on 5.1 for state management
3. **Story 5.3** (P2) - Can be done in parallel with 5.4
4. **Story 5.4** (P2) - Can be done in parallel with 5.3
5. **Story 5.5** (P0) - Must be done last to validate all fixes

## Report Issues Not Requiring Stories
- Finding #8: Cursor preservation - Already acceptable, monitoring for user reports
- Finding #6: Pattern detection - Partially addressed in 5.3 with documentation

## Success Metrics
- Zero console errors in continuous modes
- 100% of LaTeX patterns detected in send flow
- Copy LaTeX functional in all contexts
- UI state always matches internal state
- Settings sync < 100ms across tabs
- No memory leaks over 1-hour sessions

## Notes
All stories follow the established story template and include comprehensive acceptance criteria tied directly to the report findings.