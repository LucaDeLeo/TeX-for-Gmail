# Tech Stack Alignment

## Existing Technology Stack

| Category         | Current Technology                     | Version | Usage in Enhancement | Notes |
| ---------------- | -------------------------------------- | ------- | -------------------- | ----- |
| Runtime          | Chrome Extensions (Manifest V3)        | MV3     | Maintain             | Content script + options UI; no service worker today |
| Language/Style   | JavaScript (ES6)                       | ES6     | Maintain             | Enforced via `.jshintrc` |
| UI               | Options UI (HTML/CSS/JS)               | N/A     | Extend               | `src/options.html`, `src/options.js`, `src/styles.css` |
| Content Script   | DOM processing + MutationObserver       | N/A     | Maintain             | `src/content.js`; WeakMaps, debouncing, cleanup patterns |
| Rendering (ext)  | CodeCogs (primary)                     | HTTP    | Maintain (fallback)  | URL generation with DPI and `\displaystyle` for display |
| Rendering (ext)  | WordPress `s0.wp.com/latex.php`        | HTTP    | Maintain (fallback)  | Secondary fallback with server health checks |
| Rendering (local)| Simple Math (HTML/CSS)                 | N/A     | Maintain/Extend      | Optional offline; lower fidelity vs images |
| Storage          | `chrome.storage` sync/local            | N/A     | Maintain/Extend      | Validation/clamping implemented; quotas apply |
| Permissions      | `activeTab`, `storage`, host: Gmail    | N/A     | Maintain             | Least privilege; adding scopes increases friction |
| Testing          | Manual HTML harness pages              | N/A     | Extend               | `tests/*.html`; verify new flows and options |
| Packaging        | Manual load (dev)                      | N/A     | Maintain             | Web Store process not in repo |
| Telemetry        | None                                   | N/A     | N/A                  | Preserve privacy stance unless explicitly required |

## New Technology Additions

None required for PRD compliance completion. No new libraries or permissions are planned. If future scope includes local rendering or caching, candidates could include KaTeX/MathJax (local) or a lightweight cache in `chrome.storage` (out of scope for this enhancement).

> Validation checkpoint: This alignment maintains the current stack with no new libraries/permissions for compliance. Confirm if any additional constraints should be enforced.
