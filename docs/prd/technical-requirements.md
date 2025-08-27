# 🔧 Technical Requirements

## 3.1 Chrome Extension Architecture

### Manifest V3 Configuration
```json
{
  "manifest_version": 3,
  "name": "TeX for Gmail and Inbox",
  "version": "1.0.0",
  "description": "Render LaTeX equations in Gmail",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["*://mail.google.com/*"],
  "content_scripts": [{
    "matches": ["*://mail.google.com/*"],
    "js": ["content.js"],
    "css": ["styles.css"]
  }],
  "options_page": "options.html",
  "icons": {
    "128": "icon128.png"
  }
}
```

### File Structure
```
tex-for-gmail/
├── manifest.json       # Extension configuration
├── content.js         # Core logic
├── styles.css         # Visual styling
├── options.html       # Settings page
├── options.js         # Settings logic
├── icon128.png        # Extension icon
└── README.md          # Documentation
```

## 3.2 Implementation Details

### DOM Monitoring
- Target: `div[contenteditable="true"]` in compose windows
- Method: MutationObserver with debouncing
- Scope: All Gmail compose contexts (inline, popup, fullscreen)

### Rendering Pipeline
1. **Detection:** Scan text nodes for LaTeX patterns
2. **Extraction:** Isolate LaTeX code from surrounding text
3. **Validation:** Ensure LaTeX is valid and safe
4. **Rendering Selection:** Choose render method based on mode
5. **API Call/HTML Generation:** Generate URL or HTML markup
6. **DOM Update:** Replace text with rendered content
7. **State Storage:** Preserve original LaTeX for undo capability

### Undo Functionality
- Click on rendered image to revert to LaTeX source
- Support for Ctrl+Z/Cmd+Z native undo
- Original LaTeX stored in data attributes

### Performance Optimizations
- **Debouncing:** 500ms for render operations, 100ms for observers
- **Rate Limiting:** Maximum 60 API calls per minute
- **Memory Management:** WeakMaps for element tracking
- **Cleanup:** Proper observer disconnection on window close

## 3.3 API Integration Specification

```javascript
// CodeCogs URL Generation (post Story 3.1)
function getCodeCogsUrl(latex, isDisplay) {
  const encoded = encodeURIComponent(latex);
  const dpi = isDisplay ? '300' : '200';
  // Proper inline vs display handling: no inline prefix; use \displaystyle for display
  const displayPrefix = isDisplay ? '\\displaystyle' : '';
  return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${displayPrefix}%20${encoded}`;
}

// WordPress URL Generation  
function getWordPressUrl(latex) {
  const encoded = encodeURIComponent(latex);
  return `https://s0.wp.com/latex.php?latex=${encoded}&bg=ffffff&fg=000000&s=0`;
}

// Fallback Policy (high level)
// 1) Attempt CodeCogs with 4–6s timeout
// 2) On error/timeout and if fallback enabled, attempt WordPress once
// 3) If both fail, render with Simple Math (HTML) and notify user
```
