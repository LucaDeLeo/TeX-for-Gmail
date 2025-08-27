# 📋 Functional Requirements

## 1. Core Functionality

### 1.1 LaTeX Detection & Recognition

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

### 1.2 Rendering Modes

#### Rich Math Mode
- Searches for LaTeX patterns and replaces with images from external servers
- Supports complex environments (matrices, align, etc.)
- Server options:
  - **CodeCogs:** More features, supports complex LaTeX
  - **WordPress:** More reliable, simpler formulas only
- DPI defaults and range:
  - Inline: 200 DPI (default, configurable 100–400)
  - Display: 300 DPI (default, configurable 100–400)
- Fallback policy:
  - Primary server: CodeCogs; on timeout/error, automatically fall back to WordPress
  - Per-image load timeout: 4–6 seconds; at most 1 retry per server
  - If both servers fail, gracefully degrade to Simple Math mode with user notification

#### Simple Math Mode  
- Replaces LaTeX with HTML markup
- Works offline without external servers
- Customizable font styling via CSS
- Handles common mathematical expressions
 - Used as last-resort fallback when external renderers fail

#### Guess Naive TeX Mode
- Detects informal mathematical notation (e.g., `x^10`)
- Typsets with HTML using best-guess interpretation
- No delimiter requirements

### 1.3 Abbreviation Support

Common abbreviations automatically expanded:
- `\bA` → `\mathbb A` (blackboard bold)
- `\bfA` or `\dA` → `\mathbf A` (bold)
- `\cA` → `\mathcal A` (calligraphic)
- `\fA` → `\mathfrak A` (Fraktur)
- `\wA` → `\widetilde A` (wide tilde)
- `\oA` → `\overline A` (overline)
- `\uA` → `\underline A` (underline)

### 1.4 Theorem-Like Environments

Support for theorem environments with optional color themes:
```latex
\begin{theorem}[color]
Content here
\end{}
```
Color options: red, blue, green, gray, yellow (default)

## 2. User Interface Requirements

### 2.1 TeX Toggle Button

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

### 2.2 Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Once, Rich Math | F8 | Render current content once with images |
| Once, Simple Math | F9 | Render current content once with HTML |
| Nonstop, Rich Math | ⌘F8 / Ctrl+F8 | Continuous rich math rendering |
| Nonstop, Simple Math | ⌘F9 / Ctrl+F9 | Continuous simple math rendering |

### 2.3 Access Points

**Compose Mode:**
- TeX button in compose toolbar
- Keyboard shortcuts
- Button visibility configurable in Options

**Reading Mode:**
- TeX button in message toolbar
- "More" menu integration (Gmail only)
- Both can be hidden/shown via Options

### 2.4 Options Page

User-configurable settings:
- Rendering server selection (CodeCogs/WordPress)
- Server fallback toggle (enable/disable automatic fallback)
- Image quality (DPI sliders): Inline 200 default, Display 300 default (range 100–400)
- Font customization for Simple Math (separate for outgoing/incoming)
- Button visibility toggles (Compose/Read buttons)
- Keyboard shortcut enable/disable

### 2.5 Rendered Math HTML Structure

```html
<!-- Inline Math Template -->
<span class="tex-math-inline" 
      style="background-color:#d4f8d4; 
             padding:2px 4px; 
             border-radius:3px; 
             display:inline-block;">
  <img src="[render_url]" 
       alt="$latex_source$" 
       style="vertical-align:-0.2em;"> <!-- baseline alignment requirement -->
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
