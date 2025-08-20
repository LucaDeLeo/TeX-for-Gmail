# TeX for Gmail 📐

> **Render beautiful LaTeX equations directly in Gmail compose windows**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)](https://chrome.google.com)
[![Manifest Version](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.1--beta-orange)](manifest.json)

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

### Advanced Features (v1.1-beta)
- **🎯 Cursor Preservation** - Maintains exact cursor position through all operations
- **🧹 Memory Management** - Comprehensive cleanup prevents memory leaks
- **🔒 Race Condition Prevention** - Mutex patterns ensure stable operation
- **📨 Customizable Send Behavior** - Choose how LaTeX is handled when sending emails
- **⚙️ Options Page** - Configure rendering preferences and behavior
- **💻 Code Block Protection** - LaTeX in `<code>` and `<pre>` blocks is not rendered
- **💱 Currency Detection** - Intelligently distinguishes $100 from $x = 100$
- **🔍 Pattern Normalization** - Ensures consistent rendering of all equations
- **⌨️ Keyboard Shortcuts** - F8/F9 for quick rendering, Cmd/Ctrl modifiers for continuous mode
- **📖 Reading Mode** - Render LaTeX in received emails with dedicated toolbar button
- **🔤 Naive TeX Support** - Optional detection of informal notation (x^2, e^(iπ))
- **📋 Gmail More Menu** - "Render LaTeX" option in email three-dot menu

### New in v1.1 - Feature Parity Update
- **🖱️ Click-to-Edit** - Click any rendered LaTeX image to restore the original source
- **⚡ LaTeX Template Shortcuts** - 8 productivity shortcuts for common LaTeX structures
- **🔄 Tab Navigation** - Navigate between template placeholders with Tab/Shift+Tab
- **🎚️ Simple Math Mode** - Optional HTML/CSS rendering instead of images (works offline)
- **🎯 Enhanced UI Settings** - New checkboxes for Naive TeX and Simple Math modes

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

### Configuration

**Access Options:** Right-click the extension icon → "Options" or visit `chrome://extensions` → TeX for Gmail → Details → Extension options

Customizable settings include:
- Send behavior (Always/Never/Ask)
- Rendering server selection
- Image quality (DPI)
- UI controls visibility
- Font preferences for simple math
- Keyboard shortcuts (Enable/Disable)
- Reading mode button (Show/Hide)
- Naive TeX detection (Enable/Disable)
- Simple Math mode (Enable/Disable) - v1.1

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

#### Keyboard Shortcuts

**Rendering Shortcuts:**
- **F8** - Render current content once with Rich Math (images)
- **F9** - Render current content once with Simple Math (HTML/CSS)
- **Cmd+F8** (Mac) / **Ctrl+F8** (Windows) - Toggle continuous Rich Math rendering
- **Cmd+F9** (Mac) / **Ctrl+F9** (Windows) - Toggle continuous Simple Math rendering

**LaTeX Template Shortcuts (v1.1):**
- **Ctrl+Shift+F** - Insert fraction `\frac{}{}`
- **Ctrl+Shift+S** - Insert square root `\sqrt{}`
- **Ctrl+Shift+I** - Insert integral `\int_{}^{}`
- **Ctrl+Shift+M** - Insert matrix `\begin{matrix}\end{matrix}`
- **Ctrl+Shift+P** - Insert product `\prod_{}^{}`
- **Ctrl+Shift+U** - Insert sum `\sum_{}^{}`
- **Ctrl+Shift+L** - Insert limit `\lim_{}`
- **Ctrl+Shift+V** - Insert vector `\vec{}`
- **Tab** - Navigate to next placeholder `{}`
- **Shift+Tab** - Navigate to previous placeholder `{}`

*Can be disabled in extension options*

#### Click-to-Edit (v1.1)
Restore LaTeX source from rendered images:
- Click any rendered LaTeX image to restore the original source text
- Cursor automatically positioned after the opening delimiter
- Original delimiters ($, $$, \(, \[) are preserved exactly
- Works in compose, reply, and forward modes

#### Reading Mode
View LaTeX in received emails:
- TeX button appears in email toolbar when viewing messages
- Click to render all LaTeX equations in the email
- Original email content is preserved
- Works with both formal LaTeX and informal notation (when enabled)

#### Naive TeX Detection
When enabled in settings, detects informal mathematical notation:
- Superscripts: `x^2`, `e^(iπ)`
- Subscripts: `a_n`, `x_i`
- Common patterns without formal delimiters
- Useful for emails from colleagues who don't use formal LaTeX syntax

#### Code Block Protection
LaTeX within code blocks is NOT rendered:
```html
<code>This $formula$ stays as text</code>
<pre>LaTeX tutorial: Use $x^2$ for superscript</pre>
```

#### Smart Send Behavior

The extension offers three modes for handling LaTeX when sending emails:

**Always Render** (Auto-convert)
- Automatically renders all LaTeX equations when sending
- No user interaction required
- Ideal for frequent LaTeX users

**Never Render** (Send as-is)
- Sends LaTeX source code without rendering
- Useful when recipients have LaTeX rendering capabilities
- No automatic conversion

**Ask Each Time** (Default)
- Shows a confirmation dialog when LaTeX is detected
- Options: "Render and Send", "Send without rendering", or "Cancel"
- Can remember choice for current session
- Best for mixed use cases

*Configure in extension options (right-click extension icon → Options)*

## ⚠️ Known Limitations

### Critical Limitations
1. **Privacy:** All LaTeX sent to external CodeCogs API (see privacy notice)
2. **Offline Support:** No offline functionality - requires internet
3. **API Rate Limit:** Maximum 60 renders per minute

### Minor Limitations
1. **Performance:** May lag with 100+ equations in single email (tested up to 100)
2. **No Caching:** Equations re-render on every toggle
3. **Gmail Changes:** May break if Gmail updates their interface

### Browser Support
- **Supported:** Chrome 88+ (Manifest V3)
- **Not Tested:** Edge, Brave, Opera
- **Not Supported:** Firefox, Safari

## 🛠️ Technical Details

### Architecture

```
TeX-for-Gmail/
├── manifest.json          # Manifest V3 configuration
├── content.js            # Core logic (3700+ lines)
├── options.html          # Options page UI
├── options.js            # Options page logic
├── styles.css            # Visual styling
├── icon128.png           # Extension icon (128x128)
├── README.md             # This file
├── CHANGELOG.md          # Version history
├── docs/                 # Documentation
│   ├── stories/         # Development stories
│   └── reports/         # QA and test reports
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
A: Yes! Access the Options page to configure:
- Send behavior (Always/Never/Ask)
- Image quality (DPI settings)
- Rendering server choice
- UI preferences

**Q: Can I turn off auto-conversion without disabling the extension?**  
A: Yes! Set the send behavior to "Never" or "Ask" in the Options page to control when LaTeX is rendered.

**Q: Are there keyboard shortcuts?**  
A: Yes! Use F8/F9 for quick rendering, or Cmd/Ctrl+F8/F9 for continuous mode. Plus 8 template shortcuts (Ctrl+Shift+F/S/I/M/P/U/L/V) in v1.1. Can be disabled in settings.

**Q: Can I render LaTeX in emails I receive?**  
A: Yes! The extension adds a TeX button to received emails. Click it to render any LaTeX notation.

**Q: What is Naive TeX detection?**  
A: When enabled, it detects informal math notation like x^2 or e^(iπ) without formal LaTeX delimiters.

**Q: Can I click on rendered equations to edit them?**  
A: Yes! In v1.1, click any rendered LaTeX image to restore the original source text with cursor positioning.

**Q: What is Simple Math Mode?**  
A: An alternative rendering mode using HTML/CSS instead of images. It works offline and is faster, though with simpler formatting.
---

<div align="center">

**Made with ❤️ for the academic community**

⚠️ **Remember:** Your LaTeX is sent to external servers for rendering

[Report Bug](https://github.com/yourusername/tex-for-gmail/issues) · [Request Feature](https://github.com/yourusername/tex-for-gmail/issues) · [View Roadmap](CONCERNS_AND_ROADMAP.md)

</div>
