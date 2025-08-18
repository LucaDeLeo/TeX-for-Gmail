# TeX for Gmail - Product Requirements Document

## 📌 Document Information

**Version:** 3.0  
**Status:** UPDATED  
**Last Updated:** 2025-08-14  
**Product Owner:** Product Team  
**Target Release:** Q3 2025

## 🎯 Product Vision

TeX for Gmail and Inbox (TFG) enables users to seamlessly use TeX mathematical notation in emails, both for reading and writing. The extension provides multiple rendering options, from simple HTML-based math to rich server-rendered images, ensuring beautiful mathematical communication accessible to all recipients.

## 🚀 Product Goals

1. **Simplify Mathematical Communication:** Enable Gmail users to write and send beautifully rendered mathematical equations
2. **Seamless Integration:** Work naturally within Gmail's interface without disrupting workflow  
3. **Universal Accessibility:** Ensure recipients can view rendered math without installing the extension
4. **Flexible Rendering Options:** Support both online (image-based) and offline (HTML-based) rendering
5. **Performance Excellence:** Deliver instant rendering with minimal resource usage

## 📋 Functional Requirements

### 1. Core Functionality

#### 1.1 LaTeX Detection & Recognition

| Feature | Specification | Priority |
|---------|--------------|----------|
| Inline Math (Dollar) | Detect patterns between `$...$` | P0 |
| Display Math (Double Dollar) | Detect patterns between `$$...$$` | P0 |
| Inline Math (Parentheses) | Detect patterns between `\(...\)` | P0 |
| Display Math (Brackets) | Detect patterns between `\[...\]` | P0 |
| Real-time Processing | Process with 500ms debounce | P0 |
| Pattern Validation | No line breaks within delimiters | P0 |
| Currency Exclusion | Ignore patterns like `$100`, `$5.99` | P1 |
| Trailing Space Protection | Don't render formulas ending with space (e.g., `$x^2 $`) | P1 |

#### 1.2 Rendering Modes

##### Rich Math Mode
- Searches for LaTeX patterns and replaces with images from external servers
- Supports complex environments (matrices, align, etc.)
- Server options:
  - **CodeCogs:** More features, supports complex LaTeX
  - **WordPress:** More reliable, simpler formulas only
- Magnification options: 100% or 300% (default)

##### Simple Math Mode  
- Replaces LaTeX with HTML markup
- Works offline without external servers
- Customizable font styling via CSS
- Handles common mathematical expressions

##### Guess Naive TeX Mode
- Detects informal mathematical notation (e.g., `x^10`)
- Typsets with HTML using best-guess interpretation
- No delimiter requirements

#### 1.3 Abbreviation Support

Common abbreviations automatically expanded:
- `\bA` → `\mathbb A` (blackboard bold)
- `\bfA` or `\dA` → `\mathbf A` (bold)
- `\cA` → `\mathcal A` (calligraphic)
- `\fA` → `\mathfrak A` (Fraktur)
- `\wA` → `\widetilde A` (wide tilde)
- `\oA` → `\overline A` (overline)
- `\uA` → `\underline A` (underline)

#### 1.4 Theorem-Like Environments

Support for theorem environments with optional color themes:
```latex
\begin{theorem}[color]
Content here
\end{}
```
Color options: red, blue, green, gray, yellow (default)

### 2. User Interface Requirements

#### 2.1 TeX Toggle Button

```
Location: Gmail compose toolbar (bottom formatting bar)
Label: "📐 TeX" or "TeX"
States:
  - Active: Green background (#c3f3c3), green border
  - Inactive: Transparent background, gray border
  - Processing: "Toggling..." with wait cursor
Function: Toggle between rendered and source view
Scope: Per compose window (independent states)
```

#### 2.2 Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Once, Rich Math | F8 | Render current content once with images |
| Once, Simple Math | F9 | Render current content once with HTML |
| Nonstop, Rich Math | ⌘F8 / Ctrl+F8 | Continuous rich math rendering |
| Nonstop, Simple Math | ⌘F9 / Ctrl+F9 | Continuous simple math rendering |

#### 2.3 Access Points

**Compose Mode:**
- TeX button in compose toolbar
- Keyboard shortcuts
- Button visibility configurable in Options

**Reading Mode:**
- TeX button in message toolbar
- "More" menu integration (Gmail only)
- Both can be hidden/shown via Options

#### 2.4 Options Page

User-configurable settings:
- Rendering server selection (CodeCogs/WordPress)
- Magnification level (100%/300%)
- Font customization for Simple Math (separate for outgoing/incoming)
- Button visibility toggles (Compose/Read buttons)
- Keyboard shortcut enable/disable

#### 2.5 Rendered Math HTML Structure

```html
<!-- Inline Math Template -->
<span class="tex-math-inline" 
      style="background-color:#d4f8d4; 
             padding:2px 4px; 
             border-radius:3px; 
             display:inline-block;">
  <img src="[render_url]" 
       alt="$latex_source$" 
       style="vertical-align:middle;">
</span>

<!-- Display Math Template -->
<span class="tex-math-display" 
      style="background-color:#d4f8d4; 
             padding:4px 8px; 
             border-radius:3px; 
             display:inline-block; 
             margin:4px 0;">
  <img src="[render_url]" 
       alt="$$latex_source$$" 
       style="vertical-align:middle;">
</span>
```

## 🔧 Technical Requirements

### 3.1 Chrome Extension Architecture

#### Manifest V3 Configuration
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

#### File Structure
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

### 3.2 Implementation Details

#### DOM Monitoring
- Target: `div[contenteditable="true"]` in compose windows
- Method: MutationObserver with debouncing
- Scope: All Gmail compose contexts (inline, popup, fullscreen)

#### Rendering Pipeline
1. **Detection:** Scan text nodes for LaTeX patterns
2. **Extraction:** Isolate LaTeX code from surrounding text
3. **Validation:** Ensure LaTeX is valid and safe
4. **Rendering Selection:** Choose render method based on mode
5. **API Call/HTML Generation:** Generate URL or HTML markup
6. **DOM Update:** Replace text with rendered content
7. **State Storage:** Preserve original LaTeX for undo capability

#### Undo Functionality
- Click on rendered image to revert to LaTeX source
- Support for Ctrl+Z/Cmd+Z native undo
- Original LaTeX stored in data attributes

#### Performance Optimizations
- **Debouncing:** 500ms for render operations, 100ms for observers
- **Rate Limiting:** Maximum 60 API calls per minute
- **Memory Management:** WeakMaps for element tracking
- **Cleanup:** Proper observer disconnection on window close

### 3.3 API Integration Specification

```javascript
// CodeCogs URL Generation (Target after Story 3.1 fixes)
function getCodeCogsUrl(latex, isDisplay) {
  const encoded = encodeURIComponent(latex);
  const dpi = isDisplay ? '300' : '200';  // Increased from 150/110
  // Proper inline vs display handling
  const displayPrefix = isDisplay ? '\\displaystyle' : '\\inline';
  return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${displayPrefix}%20${encoded}`;
}

// WordPress URL Generation  
function getWordPressUrl(latex) {
  const encoded = encodeURIComponent(latex);
  return `https://s0.wp.com/latex.php?latex=${encoded}&bg=ffffff&fg=000000&s=0`;
}
```

## 🔒 Privacy & Security

### 4.1 Privacy Policy

- **No Data Collection:** Extension does not collect any user information
- **External Services:** Mathematical formulas in outgoing messages replaced by links to images created and controlled by:
  - CodeCogs (https://www.codecogs.com/latex/eqneditor.php)
  - WordPress (https://wordpress.com/)
- **Data Transmission:** Only LaTeX code sent to rendering services
- **Storage:** User preferences stored locally via Chrome storage API

### 4.2 Security Requirements

- **Input Validation:** LaTeX sanitization to prevent injection
- **HTTPS Only:** All API calls over secure connection
- **Permissions:** Minimal scope (activeTab, storage)
- **Content Security:** No execution of user-provided code

## 📊 Non-Functional Requirements

### 5.1 Performance Requirements

| Metric | Requirement | Measurement |
|--------|------------|-------------|
| Render Time | <500ms | From detection to display |
| Extension Size | <200KB | Total package size |
| Memory Usage | <50MB | During active use |
| API Rate | ≤60/min | Enforced client-side |
| CPU Usage | <5% | During idle state |

### 5.2 Compatibility Requirements

| Component | Requirement | Notes |
|-----------|------------|-------|
| Chrome Version | 88+ | Manifest V3 support |
| Gmail Interface | New Gmail | Dynamic DOM support |
| JavaScript | ES6+ | No external libraries |
| Network | Online for Rich Math | Simple Math works offline |
| Plain Text Mode | Must be disabled | Required for rendering |

### 5.3 Reliability Requirements

- **Server Fallback:** Automatic switch between servers on failure
- **Graceful Degradation:** Fall back to Simple Math if servers unavailable
- **Error Recovery:** Show original LaTeX on render failure
- **Status Checking:** Direct server status verification links provided

## 🎮 User Scenarios

### 6.1 Primary Use Cases

1. **Academic Email:** Professors send homework solutions with complex equations
2. **Research Collaboration:** Scientists discuss formulas in email threads
3. **Student Communication:** Students ask math questions to teachers
4. **Technical Documentation:** Engineers share specifications with formulas
5. **Quick Math Notes:** Mathematicians use naive TeX for informal communication

### 6.2 User Journey

```
1. Install Extension → Chrome Web Store
2. Open Gmail → Extension auto-initializes
3. Compose Email → TeX button appears
4. Choose Rendering Mode:
   a. Type LaTeX → Auto-renders after 500ms (nonstop mode)
   b. Type LaTeX → Click button to render (once mode)
5. Toggle View → Click button to show/hide source
6. Send Email → Recipients see rendered math
7. Read Email → Use TeX button or More menu to render received math
```

### 6.3 Edge Cases & Handling

| Scenario | Behavior | Resolution |
|----------|----------|------------|
| Invalid LaTeX | Show original text | Log error to console |
| Network failure | Keep source text | Try alternate server |
| Rate limit hit | Pause rendering | Show notification |
| Gmail update | Fallback selectors | Multiple strategies |
| Currency amounts | Don't render | Pattern exclusion |
| Server down | Switch to backup | WordPress/CodeCogs fallback |
| Mixed content | Render valid parts | Partial rendering |

## ❌ Out of Scope

The following features are intentionally excluded from this release:

- **Custom Macros:** User-defined LaTeX macros (future version)
- **Multiple Profiles:** Different settings per account
- **Export Features:** Save/export rendered equations
- **Mobile Support:** Desktop Chrome only
- **Collaborative Editing:** Single user only
- **Inbox Support:** Gmail only (Inbox discontinued)
- **Legacy Gmail:** Old Gmail interface not supported
- **Browser Extensions:** Chrome only (no Firefox/Edge)

## ✅ Success Metrics

### 7.1 Key Performance Indicators

| Metric | Target | Method |
|--------|--------|--------|
| Install Success Rate | >95% | Chrome Web Store metrics |
| Render Success Rate | >99% | Error logging |
| User Engagement | >50% daily active | Usage analytics |
| Performance SLA | <500ms p95 | Performance monitoring |
| User Satisfaction | >4.5 stars | Store reviews |
| Server Uptime | >99% | Status monitoring |

### 7.2 Acceptance Criteria

- [ ] All functional requirements implemented
- [ ] Performance targets met
- [ ] Manual test checklist passed
- [ ] Integration tests passed
- [ ] Options page functional
- [ ] Keyboard shortcuts working
- [ ] Both rendering modes operational
- [ ] No critical bugs
- [ ] Documentation complete

## 🚢 Release Plan

### Phase 1: Core Development (Completed)
- Core infrastructure ✅
- Basic LaTeX rendering ✅
- Toggle control ✅
- Pattern detection ✅

### Phase 2: Enhanced Features (Current)
- Multiple rendering modes
- Keyboard shortcuts
- Options page
- Abbreviation support
- Theorem environments
- Server fallback

### Phase 3: Testing & Polish
- Integration testing
- Performance validation
- Cross-environment testing
- User acceptance testing

### Phase 4: Deployment
- Chrome Developer Mode testing
- Beta user feedback
- Chrome Web Store submission
- Marketing materials

### Phase 5: Post-Launch
- Monitor metrics
- Gather user feedback
- Plan enhancement backlog
- Consider custom macros support

## ⚠️ Known Issues & User Feedback

### Critical Issues Identified (2025-08-14)

Based on user feedback from JessRiedel, the following issues need addressing:

#### 1. Low Resolution Rendering
**Issue:** Images are rendered at low DPI (110 for inline, 150 for display), resulting in blurry equations
**Current State:** Equations appear pixelated compared to the legacy extension
**Impact:** Poor visual quality affects readability and professional appearance
**Target Fix:** Increase DPI to 200+ for inline and 300+ for display math

#### 2. Automatic Rendering on Send
**Issue:** When toggle is OFF and user sends email with LaTeX, extension automatically renders without consent
**User Expectation:** Toggle OFF should mean "don't touch my LaTeX" 
**Current Behavior:** Send interceptor forces rendering for recipient benefit
**Target Fix:** Add user preference for send behavior (always render, never render, ask each time)

#### 3. Inline vs Display Mode Incorrect
**Issue:** All equations render in display mode regardless of delimiter type
**Expected:** 
- Single `$...$` should render inline (small, flows with text)
- Double `$$...$$` should render display (large, centered, own line)
**Current:** Both render as display mode with only size difference
**Target Fix:** Proper inline/display distinction with correct LaTeX mode selection

#### 4. Baseline Alignment 
**Issue:** Inline equations don't align properly with surrounding text baseline
**Visual Impact:** Equations appear shifted up/down relative to text
**Target Fix:** Use proper vertical-align CSS and baseline positioning

## 📘 Development Epic Structure

### Epic TEX-002: Enhanced Rendering & LaTeX Support
**Sprint:** 2025-Q4-S1  
**Status:** Planned  
**Goal:** Fix critical rendering issues and expand capabilities with multiple modes and comprehensive LaTeX pattern support

#### User Stories:

**Story 3.1: Fix Core Rendering Issues & Multi-Mode System**
- **CRITICAL:** Fix low DPI issue - increase to 200+ (inline) and 300+ (display)
- **CRITICAL:** Fix inline vs display mode - proper `$` vs `$$` handling with correct LaTeX modes
- **CRITICAL:** Fix baseline alignment for inline equations
- Implement Simple Math (HTML-based offline rendering)
- Implement Guess Naive TeX (auto-detect informal math)
- Add WordPress as fallback server with auto-switching
- Server health monitoring and graceful degradation

**Story 3.2: Extended LaTeX Patterns & Features**
- Support \(...\) and \[...\] delimiters
- Implement abbreviation system (\bA → \mathbb A, etc.)
- Add theorem environments with color themes
- Handle trailing spaces and currency exclusion properly
- Ensure proper inline/display distinction for all pattern types

### Epic TEX-003: User Control & Polish
**Sprint:** 2025-Q4-S2  
**Status:** Planned  
**Goal:** Give users control over the extension behavior and improve UX

#### User Stories:

**Story 4.1: Options Page & Preferences**
- Create options.html with settings UI
- Implement Chrome storage API for preferences
- **CRITICAL:** Add send behavior preference (always render, never render, ask)
- Add popup dialog for "ask on send" option
- Add server selection, magnification, font customization
- Button visibility controls for compose/read modes
- DPI customization settings for image quality

**Story 4.2: Keyboard Shortcuts & Reading Mode**
- Implement F8/F9 for once rendering
- Implement Cmd+F8/F9 for continuous rendering
- Add "More" menu integration for reading emails
- Ensure all modes work in both compose and read contexts

### Implementation Notes:
- **Priority:** Story 3.1 should be implemented first to fix critical user-reported issues
- Each story delivers meaningful user value independently
- Stories build on the completed TEX-001 MVP foundation
- Total scope: 4 stories across 2 sprints
- Maintains backward compatibility with existing functionality
- Critical fixes (DPI, inline/display, send behavior) take precedence over new features

## 🧰 Troubleshooting Guide

### For Users

1. **Extension Not Working:**
   - Check if Stay Focused or similar blocking extensions are active
   - Ensure www.codecogs.com and s0.wp.com are unblocked
   - Reload Gmail page
   - Clear browser cache (Chrome → More Tools → Clear Browsing Data)
   
2. **Rendering Issues:**
   - Verify not in Plain Text mode
   - Check network connection for Rich Math
   - Try switching rendering servers in Options
   - Use Simple Math for offline work

3. **Support:**
   - Email developer at va.email.tex@gmail.com

## 📚 Appendices

### A. Technical Decisions Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Dual server support | Reliability and feature balance | 2025-08 |
| HTML fallback mode | Offline capability | 2025-08 |
| Manifest V3 | Future-proof, required by Chrome | 2025-07 |
| No background worker | Simplicity, all logic in content | 2025-07 |
| Green highlight color | Brand recognition from v1 | 2025-07 |
| Keyboard shortcuts | Power user efficiency | 2025-08 |

### B. Risk Register

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Gmail DOM changes | High | Multiple selectors, version detection | Dev |
| API rate limits | Medium | Client-side limiting, server switching | Dev |
| Server downtime | Medium | Dual server support, offline mode | Dev |
| Browser updates | Low | Regular testing, beta channel monitoring | QA |
| LaTeX complexity | Low | Documentation, examples | Doc |

### C. Glossary

- **LaTeX:** Document preparation system for mathematical notation
- **TeX:** The underlying typesetting system
- **TFG:** TeX for Gmail (this extension)
- **CodeCogs:** Third-party LaTeX rendering service
- **WordPress:** Alternative LaTeX rendering service
- **Manifest V3:** Latest Chrome extension specification
- **Content Script:** JavaScript injected into web pages
- **DOM:** Document Object Model
- **Rich Math:** Image-based rendering mode
- **Simple Math:** HTML-based rendering mode
- **Naive TeX:** Informal mathematical notation

---

**Document Status:** UPDATED WITH FULL FEATURE SET  
**Next Review:** Post-implementation testing phase