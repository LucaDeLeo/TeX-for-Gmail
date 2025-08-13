# TeX for Gmail 📐

> **Render beautiful LaTeX equations directly in Gmail compose windows**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)](https://chrome.google.com)
[![Manifest Version](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0--beta-orange)](manifest.json)

## ⚠️ Important Privacy Notice

**This extension sends your LaTeX content to the external CodeCogs API for rendering.** This means:
- Your mathematical formulas are transmitted over the internet to a third-party service
- CodeCogs may log or process this data according to their privacy policy
- Not suitable for confidential, proprietary, or sensitive mathematical content
- Requires internet connection - will not work offline

*Future versions will include local rendering options for enhanced privacy and offline support.*

---

## ✨ Features

### Core Functionality
- **🔬 Real-time LaTeX Rendering** - Automatic rendering with smart debouncing (500ms)
- **🔄 Toggle Control** - Switch between LaTeX source and rendered equations instantly
- **📧 Universal Compatibility** - Recipients see rendered math without any extension
- **💾 Smart State Management** - Toggle states preserved per compose window

### Advanced Features (v1.0-beta)
- **🎯 Cursor Preservation** - Maintains exact cursor position through all operations
- **🧹 Memory Management** - Comprehensive cleanup prevents memory leaks
- **🔒 Race Condition Prevention** - Mutex patterns ensure stable operation
- **📨 Smart Send Interceptor** - Automatically renders LaTeX when sending (if toggle is OFF)
- **💻 Code Block Protection** - LaTeX in `<code>` and `<pre>` blocks is not rendered
- **💱 Currency Detection** - Intelligently distinguishes $100 from $x = 100$
- **🔍 Pattern Normalization** - Ensures consistent rendering of all equations

## 🚀 Quick Start

### Installation

#### Developer Mode (Currently Available)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `TeX-for-Gmail` directory
6. The extension icon should appear in your toolbar

#### Chrome Web Store (Coming Soon)
*Pending review and approval*

### Basic Usage

1. **Open Gmail** and compose a new email
2. **Look for the TeX button** (📐) in the compose toolbar
3. **Type LaTeX notation:**
   - Inline math: `$E = mc^2$`
   - Display math: `$$\int_0^1 f(x) dx$$`
4. **Watch it render** automatically after ~500ms
5. **Toggle rendering** ON/OFF with the TeX button

## 📖 User Guide

### Writing LaTeX

#### Inline Mathematics
Single dollar signs for inline equations:
```latex
The equation $E = mc^2$ revolutionized physics.
```

#### Display Mathematics
Double dollar signs for centered display equations:
```latex
$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$
```

### Smart Features

#### Toggle States
- **📐 TeX ON (Green):** Real-time LaTeX rendering active
- **📐 TeX OFF (Gray):** Shows LaTeX source code
- State preserved per compose window
- Cursor position maintained during toggle

#### Code Block Protection
LaTeX within code blocks is NOT rendered:
```html
<code>This $formula$ stays as text</code>
<pre>LaTeX tutorial: Use $x^2$ for superscript</pre>
```

#### Smart Send Behavior
When sending an email with toggle OFF:
1. Extension detects LaTeX content
2. Automatically renders equations
3. Sends email with rendered images
4. Restores source view after sending

## ⚠️ Known Limitations

### Critical Limitations
1. **Privacy:** All LaTeX sent to external CodeCogs API (see privacy notice)
2. **Offline Support:** No offline functionality - requires internet
3. **API Rate Limit:** Maximum 60 renders per minute

### Minor Limitations
1. **Copy/Paste:** Cannot copy LaTeX source from rendered equations
2. **Performance:** May lag with 50+ equations in single email
3. **No Caching:** Equations re-render on every toggle
4. **Gmail Changes:** May break if Gmail updates their interface

### Browser Support
- **Supported:** Chrome 88+ (Manifest V3)
- **Not Tested:** Edge, Brave, Opera
- **Not Supported:** Firefox, Safari

## 🛠️ Technical Details

### Architecture

```
TeX-for-Gmail/
├── manifest.json          # Manifest V3 configuration
├── content.js            # Core logic (1500+ lines)
├── styles.css            # Visual styling
├── icon128.png           # Extension icon (128x128)
├── README.md             # This file
├── CONCERNS_AND_ROADMAP.md # Future development plans
└── tests/                # Test harnesses
    └── test-*.html       # Test files
```

### How It Works

1. **Initialization**
   - Content script injects on Gmail pages
   - Sets up global MutationObserver for compose detection

2. **Compose Detection**
   - Monitors DOM for new compose windows
   - Adds TeX toggle button to toolbar
   - Initializes state management

3. **LaTeX Processing**
   - TreeWalker scans text nodes (skips code/pre/script/style)
   - Regex patterns detect LaTeX: `/\$([^\$\n]+?)\$/g`
   - Validates LaTeX against XSS attacks
   - Sends to CodeCogs API for rendering

4. **Rendering Pipeline**
   - Creates styled `<span>` wrapper with `data-latex` attribute
   - Inserts `<img>` with rendered equation
   - Preserves cursor position using absolute offset calculation
   - Normalizes text nodes after restoration

5. **State Management**
   - WeakMaps prevent memory leaks
   - Per-compose-area toggle states
   - Comprehensive cleanup on compose close

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

### Frequently Asked Questions

**Q: Is my mathematical content private?**  
A: No - LaTeX is sent to CodeCogs API. Use caution with sensitive content.

**Q: Can I use this offline?**  
A: No - requires internet for API calls. Local rendering planned for v2.0.

**Q: Why doesn't it work in dark mode?**  
A: Images have white backgrounds. Dark mode support planned.

**Q: Do recipients need the extension?**  
A: No - equations are converted to images visible to anyone.

**Q: Can I customize the rendering?**  
A: Not currently. Customization planned for future versions.

**Q: Is there a keyboard shortcut?**  
A: Not yet. Planned for future release.
---

<div align="center">

**Made with ❤️ for the academic community**

⚠️ **Remember:** Your LaTeX is sent to external servers for rendering

[Report Bug](https://github.com/yourusername/tex-for-gmail/issues) · [Request Feature](https://github.com/yourusername/tex-for-gmail/issues) · [View Roadmap](CONCERNS_AND_ROADMAP.md)

</div>
