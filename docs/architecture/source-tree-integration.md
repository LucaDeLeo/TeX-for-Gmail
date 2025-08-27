# Source Tree Integration

## Existing Project Structure (relevant parts)

```
TeX-for-Gmail/
├── manifest.json
├── src/
│   ├── content.js
│   ├── options.html
│   ├── options.js
│   └── styles.css
├── assets/
│   └── icons/
│       └── icon128.png
├── tests/
│   ├── test-inline-display.html (example)
│   └── test-story-4.3.html (example)
└── docs/
    ├── prd/
    ├── stories/
    └── architecture.md
```

## New File Organization (additions only; keep `src/` flat)

```
TeX-for-Gmail/
├── src/
│   ├── rendering-adapter.js       # Optional: adapter to centralize rendering selection
│   ├── render-external.js         # Optional: extract external render URL/health logic
│   ├── render-local.js            # Optional: local renderer stub (future scope)
│   └── storage.js                 # Optional: extract StorageService for reuse
├── tests/
│   ├── test-local-rendering.html  # Harness for local rendering behavior [TBD]
│   └── test-fallbacks.html        # Harness for external fallback/server switching [TBD]
```

## Integration Guidelines
- File Naming: camelCase modules; `render-*.js` for renderer implementations; avoid directories in `src/`.
- Folder Organization: Keep `src/` flat per repo guidelines; no build system assumptions.
- Import/Export Patterns: Named exports for renderer functions; adapter provides a single entry (`renderEquation(latex, mode, opts)`).
- Minimal Refactor: For PRD compliance, prefer in‑place fixes in `content.js`. Introduce adapter/extractions only if they reduce risk or simplify testing.

> Validation checkpoint: Proposed structure minimizes churn and follows existing flat `src/` pattern. Confirm acceptance or suggest constraints (e.g., avoid extracting StorageService).
