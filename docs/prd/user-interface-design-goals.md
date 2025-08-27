# User Interface Design Goals

## Overall UX Vision
Integrate unobtrusively into Gmail. Provide a simple toggle button, sensible defaults, and fast feedback. Keep original content recoverable and preserve cursor positions during rendering.

## Key Interaction Paradigms
- Compose toolbar toggle (per-compose state).
- One-shot rendering (F8/F9) and continuous modes (Cmd/Ctrl+F8/F9).
- Click-to-edit rendered images to restore LaTeX.
- Reading mode overlay rendering and “More” menu integration.
- Options page for configuration; toast notifications for state and errors.

## Core Screens and Views
- Gmail Compose (contenteditable area + formatting toolbar)
- Gmail Reading View (message toolbar + message body)
- Extension Options Page (settings and previews)

## Accessibility: WCAG AA
Keyboard-operable controls, aria-live announcements for toasts and state changes; high-contrast friendly UI.

## Branding
Follow Gmail’s visual language; minimal, neutral styling with subtle accents for states (success/error/info toasts).

## Target Device and Platforms: Desktop Only
Chrome on desktop (Windows, macOS, Linux). Gmail web interface only.
