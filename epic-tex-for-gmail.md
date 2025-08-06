# TeX for Gmail - Manifest V3 Chrome Extension Implementation Epic

## Epic Goal

Enable LaTeX mathematical notation rendering in Gmail compose windows with real-time visual feedback, replacing the legacy WASM-based implementation with a streamlined CodeCogs API solution that meets Manifest V3 requirements.

## Epic Description

### Existing System Context

- **Current relevant functionality:** Legacy TeX for Gmail extension using WebAssembly (pdflatex.wasm, libmupdf.wasm) for local PDF generation and rendering
- **Technology stack:** Chrome Extension (being migrated from Manifest V2 to V3), JavaScript, WebAssembly modules
- **Integration points:** Gmail compose window DOM, Chrome Extension APIs, PDF rendering pipeline

### Enhancement Details

- **What's being added/changed:** Complete rebuild as Manifest V3 extension, replacing complex WASM-based PDF generation with CodeCogs API for LaTeX rendering. Simplifying architecture while maintaining core user experience.
- **How it integrates:** Content script injection into Gmail pages, MutationObserver for DOM monitoring, direct image embedding in compose window
- **Success criteria:** 
  - Real-time LaTeX rendering with green highlight background
  - Toggle functionality between source and rendered views
  - Recipients see rendered math without needing extension
  - Manifest V3 compliant and under 100KB total size
  - Chrome 88+ compatibility

## Stories

### Story 1: Core Extension Infrastructure and Gmail Integration
Set up Manifest V3 extension structure with content script injection into Gmail. Implement DOM monitoring using MutationObserver to detect compose windows and track contenteditable divs. Create base styling with green background wrapper classes. Establish extension file structure (manifest.json, content.js, styles.css).

### Story 2: LaTeX Detection and CodeCogs Rendering Pipeline  
Implement real-time LaTeX pattern detection for inline ($...$) and display ($$...$$) math. Integrate CodeCogs API for LaTeX-to-PNG conversion with proper URL encoding and size differentiation. Create render pipeline that preserves cursor position and handles text-to-image replacement with proper alt text. Implement 500ms debouncing and smart re-rendering logic.

### Story 3: Toggle Control and User Interaction
Add TeX button to Gmail compose toolbar with active/inactive visual states. Implement toggle functionality to switch between rendered images and source LaTeX. Store original LaTeX in data attributes for restoration. Maintain toggle state per compose window with proper cleanup on window close. Handle edge cases like currency detection and broken LaTeX gracefully.

## Compatibility Requirements

- [x] Chrome Extension Manifest V3 APIs only (no V2 deprecated features)
- [x] Pure JavaScript implementation (no external libraries)
- [x] Gmail new interface compatibility (dynamic DOM handling)
- [x] Images embedded as data URLs or external links (recipients don't need extension)
- [x] Chrome 88+ browser version support
- [x] Extension size under 100KB total

## Risk Mitigation

- **Primary Risk:** Gmail DOM structure changes breaking element selection
- **Mitigation:** Use multiple selector strategies with fallbacks, monitor for Gmail UI updates, implement error boundaries
- **Rollback Plan:** Users can disable extension via Chrome settings; original LaTeX text always preserved in alt attributes for manual recovery

## Definition of Done

- [x] All three stories completed with acceptance criteria met
- [x] Real-time LaTeX rendering functional with <500ms response time
- [x] Toggle button properly integrated in Gmail toolbar
- [x] Extension works across different Gmail themes and layouts
- [x] Manifest V3 compliance verified
- [x] Extension size under 100KB confirmed
- [x] Manual testing completed for:
  - Inline and display math rendering
  - Toggle functionality
  - Draft saving and restoration
  - Sending emails with rendered math
  - Edge cases (currency, broken LaTeX)
- [x] README with installation instructions created
- [x] No console errors or warnings in normal operation

## Technical Specifications

### API Integration
```javascript
// CodeCogs URL generation
function getCodeCogsUrl(latex, isDisplay) {
  const encoded = encodeURIComponent(latex);
  const dpi = isDisplay ? '150' : '110';
  const size = isDisplay ? '\\large' : '\\normalsize';
  return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${size}%20${encoded}`;
}
```

### File Structure
```
tex-for-gmail/
├── manifest.json       // Manifest V3 configuration
├── content.js         // Main logic and DOM manipulation
├── styles.css         // Green box and math styling
├── icon128.png        // Extension icon
└── README.md          // Installation and usage guide
```

## Handoff to Development Team

**Development Team Handoff:**

Please develop the TeX for Gmail Chrome extension following this epic. Key considerations:

- This is a complete rebuild replacing a WebAssembly-based system with a simpler CodeCogs API approach
- Integration points: Gmail compose window contenteditable divs, Chrome Extension Manifest V3 APIs
- Existing patterns to follow: Chrome Extension best practices, Gmail DOM interaction patterns
- Critical compatibility requirements: Manifest V3 compliance, pure JavaScript, <100KB size limit
- Each story must maintain graceful degradation - never lose user's LaTeX source text
- Performance target: <500ms rendering response with proper debouncing

The epic should deliver a seamless LaTeX rendering experience in Gmail while maintaining simplicity and reliability over the previous complex WASM implementation.

## Notes

- This replaces the previous complex architecture involving WebAssembly, background workers, and local PDF generation
- Focus on simplicity and reliability over advanced features
- Out of scope: options page, multiple rendering engines, keyboard shortcuts, custom macros, offline support
- The green background (#d4f8d4) is a signature visual element that should be preserved from the original