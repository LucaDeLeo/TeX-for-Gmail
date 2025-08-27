# Documentation Index

## Root Documents

### [Repository Guidelines](../AGENTS.md)

Contributor guide for this repository: structure, coding/testing conventions, commit/PR tips, and BMAD agent notes.

### [TeX for Gmail - Technical Concerns & Future Roadmap](./CONCERNS_AND_ROADMAP.md)

This document captures technical concerns, architectural limitations, and future improvement opportunities identified during comprehensive QA review and ultra-think analysis. It serves as a guide f...

### [TeX for Gmail Feature Comparison](./FEATURE_COMPARISON.md)

Generated: 2025-01-19

### [TeX for Gmail - Chrome Extension Epic](./epic-tex-for-gmail.md)

**Epic ID:** TEX-001

## TeX for Gmail Product Requirements Document (PRD)

Multi-part document located in `prd/`.

### [📚 Appendices](./prd/appendices.md)

| Decision | Rationale | Date |

### [Checklist Results Report](./prd/checklist-results-report.md)

Pending: Will be populated after running the PM checklist with stakeholders.

### [📘 Development Epic Structure](./prd/development-epic-structure.md)

**Sprint:** 2025-Q4-S1

### [📌 Document Information](./prd/document-information.md)

**Version:** 3.0

### [Epic List](./prd/epic-list.md)

- Epic 1: Enhanced Rendering & LaTeX Support

### [📋 Functional Requirements](./prd/functional-requirements.md)

| Feature | Specification | Priority |

### [Goals and Background Context](./prd/goals-and-background-context.md)

- Enable Gmail users to write and send beautifully rendered LaTeX.

### [TeX for Gmail Product Requirements Document (PRD)](./prd/index.md)

- [TeX for Gmail Product Requirements Document (PRD)](#table-of-contents)

### [⚠️ Known Issues & User Feedback](./prd/known-issues-user-feedback.md)

Based on user feedback from JessRiedel, the following issues need addressing:

### [Next Steps](./prd/next-steps.md)

Use this PRD to validate UI flows for compose/read modes and refine accessibility to WCAG AA.

### [📊 Non-Functional Requirements](./prd/non-functional-requirements.md)

| Metric | Requirement | Measurement |

### [❌ Out of Scope](./prd/out-of-scope.md)

The following features are intentionally excluded from this release:

### [🔒 Privacy & Security](./prd/privacy-security.md)

- **No Data Collection:** Extension does not collect any user information

### [🚢 Release Plan](./prd/release-plan.md)

- Core infrastructure ✅

### [Requirements](./prd/requirements.md)

- FR1: Detect inline math using `$...$`.

### [✅ Success Metrics](./prd/success-metrics.md)

| Metric | Target | Method |

### [Technical Assumptions](./prd/technical-assumptions.md)

- Platform: Chrome Extension, Manifest V3, content script architecture (no background worker).

### [🔧 Technical Requirements](./prd/technical-requirements.md)

```json

### [🧰 Troubleshooting Guide](./prd/troubleshooting-guide.md)

1. **Extension Not Working:**

### [User Interface Design Goals](./prd/user-interface-design-goals.md)

Integrate unobtrusively into Gmail. Provide a simple toggle button, sensible defaults, and fast feedback. Keep original content recoverable and preserve cursor positions during rendering.

### [🎮 User Scenarios](./prd/user-scenarios.md)

1. **Academic Email:** Professors send homework solutions with complex equations

## Qa

Documents within the `qa/` directory:

## Reports

Documents within the `reports/` directory:

### [Completed Stories Review](./reports/COMPLETED-STORIES-REVIEW.md)

Date: 2025-08-27

### [Final QA Report: Inline vs Display LaTeX Fix VERIFIED ✅](./reports/FINAL-QA-REPORT.md)

**Status:** ✅ **FIXED AND VERIFIED**

### [Final Test Results - Story 4.1 Fixes](./reports/FINAL-TEST-RESULTS-4.1.md)

**Test Date:** 2025-08-14

### [TeX-for-Gmail: Inline vs Display Mode Fix Summary](./reports/FIX-SUMMARY.md)

**Problem:** Extension was not differentiating between inline (`$...$`) and display (`$$...$$`) LaTeX rendering modes. All equations were rendering in display style with incorrect baseline alignment.

### [TeX for Gmail - Production Readiness Assessment](./reports/PRODUCTION_READINESS.md)

**Date:** August 13, 2025

### [TeX for Gmail Extension - Comprehensive QA Review Report](./reports/QA_REVIEW_REPORT.md)

**Date**: 2025-08-12

### [Sprint Change Proposal — TeX for Gmail](./reports/SPRINT-CHANGE-PROPOSAL.md)

Date: 2025-08-27

### [TeX for Gmail Extension - Comprehensive Test Report](./reports/TEST-REPORT-4.1.md)

**Test Date:** 2025-08-14

### [TeX-for-Gmail Test Report - Playwright Automated Testing](./reports/TEST-REPORT.md)

✅ **All critical fixes VERIFIED** using Playwright browser automation with visual verification.

### [TeX for Gmail - Manual Test Checklist](./reports/TEST_CHECKLIST.md)

This document provides a comprehensive testing protocol for TeX for Gmail extension. All tests should be performed before releases and after significant changes.

### [TeX for Gmail - Integration Test Report](./reports/integration-test-report.md)

---

### [TeX for Gmail - Manual Test Checklist](./reports/manual-test-checklist.md)

1. Open Chrome and navigate to `chrome://extensions/`

### [QA Report: Inline vs Display Mode LaTeX Rendering Issue](./reports/qa-report-inline-display-issue.md)

**Status:** ❌ **NOT FIXED** - Critical rendering issues confirmed

## Stories

Documents within the `stories/` directory:

### [Story 1.1: Core Extension Setup & Gmail Integration](./stories/1.1.story.md)

Done

### [Story 1.2: LaTeX Detection and CodeCogs Rendering Pipeline](./stories/1.2.story.md)

Done

### [Story 1.3: Toggle Control and User Interaction](./stories/1.3.story.md)

Done

### [Story 2.1: Critical Bug Fixes - Cursor Preservation and Memory Management](./stories/2.1.story.md)

Done

### [Story 2.2: Self-Documenting LaTeX Images with Attribute-Based Source Storage](./stories/2.2.story.md)

Done

### [Story 3.1: Fix Core Rendering Issues & Multi-Mode System](./stories/3.1.story.md)

Completed - Production Ready

### [Story 3.2: Extended LaTeX Patterns & Features](./stories/3.2.story.md)

Done - Passed QA Review (with fixes)

### [Story 4.1: Options Page & Preferences](./stories/4.1.story.md)

Done

### [Story 4.2: Keyboard Shortcuts & Reading Mode](./stories/4.2.story.md)

Approved

### [Story 4.3: Feature Parity - Click-to-Edit, TeX Shortcuts & UI Settings](./stories/4.3.story.md)

Done

### [Epics and Stories — Reformatted](./stories/EPICS-AND-STORIES.md)

This document consolidates stories into Epic sections using the template structure: “Epic {{number}} {{title}}” and “Story {{epic}}.{{story}} {{title}}” with numbered acceptance criteria.
