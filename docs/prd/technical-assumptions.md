# Technical Assumptions

- Platform: Chrome Extension, Manifest V3, content script architecture (no background worker).
- Language/Runtime: JavaScript (ES6+), DOM APIs, MutationObserver.
- External Services: CodeCogs (primary) and WordPress (fallback) for image rendering.
- Rendering Policy: Inline uses no style prefix; display uses `\displaystyle`; DPI defaults 200/300.
- Fallback Policy: Per-image timeout 4–6s; at most 1 retry per server; degrade to Simple Math.
- Storage: `chrome.storage.sync` with fallback to `chrome.storage.local` and in-memory defaults.
- Testing: HTML harnesses and Playwright (manual/visual) for critical flows.
