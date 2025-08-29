# LaTeX Rendering Debug - TeX for Gmail Extension

## Problem Statement
I have a Chrome extension (TeX for Gmail) that renders LaTeX equations in Gmail. The content script (`src/content.js`) loads successfully in test HTML pages, but LaTeX equations are **NOT being detected or rendered** in non-Gmail test pages, despite the rendering function being called.

## Current Status

### ✅ WORKING: test-gmail.html
- Simulates Gmail's DOM structure
- Successfully renders 5 LaTeX equations
- DOM inspection shows:
  - `inlineEquations: 3`
  - `displayEquations: 2`
  - `renderedImages: 5`

### ❌ NOT WORKING: test-inline-display.html & test-story-4.5.html
- Content script loads successfully
- `TeXForGmail` object is initialized
- `detectAndRenderLatex()` function is called on DOMContentLoaded
- **BUT: 0 equations are rendered**
- DOM inspection shows:
  - `inlineEquations: 0`
  - `displayEquations: 0`
  - `renderedImages: 0`

## Console Errors (Present in ALL test pages)
```javascript
TypeError: Cannot read properties of undefined (reading 'sync')
    at StorageService.get // Chrome storage API not available in file:// context

TypeError: Cannot read properties of undefined (reading 'onChanged')
    at TeXForGmail.cleanup // Extension event handlers not available
```

## Key Code: detectAndRenderLatex Function (content.js lines 1076-1280)

```javascript
function detectAndRenderLatex(rootElement, options = {}) {
    // Allow call without explicit target by detecting compose area
    if (!rootElement) { 
      rootElement = findComposeArea(); 
      if (!rootElement) return false; 
    }
    const { oneTimeRender = false, isReadMode = false } = options;
    if (!oneTimeRender && !getToggleState(rootElement)) { 
      TeXForGmail.log('Rendering disabled by toggle, skipping'); 
      return false; 
    }
    if (!isReadMode && rootElement.getAttribute('data-tex-processing') === 'true') { 
      TeXForGmail.log('Already processing this area, skipping'); 
      return false; 
    }
    rootElement.setAttribute('data-tex-processing', 'true');
    
    try {
      const textNodes = findTextNodes(rootElement);
      let hasChanges = false;

      textNodes.forEach(textNode => {
        if (textNode.parentNode?.getAttribute('data-tex-processing-node') === 'true') return;
        let text = textNode.textContent;

        // Mask escaped dollar signs
        const ESCAPED_DOLLAR_PLACEHOLDER = '__ESCAPED_DOLLAR_' + Math.random().toString(36).slice(2) + '__';
        const hasEscapedDollar = text.includes('\\$');
        if (hasEscapedDollar) text = text.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

        const parent = textNode.parentNode;

        // [Theorem environment processing code omitted for brevity]

        // Display and inline math matches (collect)
        const matches = [];
        let match;

        // $$...$$
        LATEX_PATTERNS.display.lastIndex = 0;
        while ((match = LATEX_PATTERNS.display.exec(text)) !== null) {
          matches.push({ 
            type: 'display', 
            start: match.index, 
            end: match.index + match[0].length, 
            latex: (match[1] || '').trim(), 
            full: match[0] 
          });
        }
        
        // \[...\]
        LATEX_PATTERNS.displayBracket.lastIndex = 0;
        while ((match = LATEX_PATTERNS.displayBracket.exec(text)) !== null) {
          matches.push({ 
            type: 'display', 
            start: match.index, 
            end: match.index + match[0].length, 
            latex: (match[1] || '').trim(), 
            full: match[0] 
          });
        }
        
        // $...$
        LATEX_PATTERNS.inline.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inline.exec(text)) !== null) {
          // avoid overlapping display
          const overlapDisplay = matches.some(m => 
            m.type === 'display' && match.index >= m.start && match.index < m.end
          );
          if (!overlapDisplay && !isCurrency(match[0])) {
            matches.push({ 
              type: 'inline', 
              start: match.index, 
              end: match.index + match[0].length, 
              latex: (match[1] || '').trim(), 
              full: match[0] 
            });
          }
        }
        
        // \(...\)
        LATEX_PATTERNS.inlineBracket.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inlineBracket.exec(text)) !== null) {
          matches.push({ 
            type: 'inline', 
            start: match.index, 
            end: match.index + match[0].length, 
            latex: (match[1] || '').trim(), 
            full: match[0] 
          });
        }

        if (matches.length === 0) return; // No LaTeX found

        // Sort by position
        matches.sort((a, b) => a.start - b.start);

        // Create fragment with text and rendered math
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        matches.forEach(m => {
          // Add text before match
          if (m.start > lastIndex) {
            const beforeText = text.substring(lastIndex, m.start);
            if (hasEscapedDollar) {
              fragment.appendChild(document.createTextNode(
                beforeText.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$')
              ));
            } else {
              fragment.appendChild(document.createTextNode(beforeText));
            }
          }
          
          // Create and add math wrapper
          const wrapper = createMathWrapper(m.latex, m.type === 'display');
          if (wrapper) {
            fragment.appendChild(wrapper);
            hasChanges = true;
          }
          
          lastIndex = m.end;
        });
        
        // Add remaining text
        if (lastIndex < text.length) {
          const afterText = text.substring(lastIndex);
          if (hasEscapedDollar) {
            fragment.appendChild(document.createTextNode(
              afterText.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$')
            ));
          } else {
            fragment.appendChild(document.createTextNode(afterText));
          }
        }
        
        // Replace text node with fragment
        parent.setAttribute('data-tex-processing-node', 'true');
        parent.insertBefore(fragment, textNode);
        parent.removeChild(textNode);
        parent.removeAttribute('data-tex-processing-node');
      });
      
      return hasChanges;
    } finally {
      rootElement.removeAttribute('data-tex-processing');
    }
  }
```

## Test HTML File (test-inline-display.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test: Inline vs Display LaTeX Rendering</title>
    <style>
        .compose-area {
            min-height: 100px;
            padding: 10px;
            border: 1px solid #ccc;
            background: white;
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <h1>TeX-for-Gmail: Inline vs Display Mode Testing</h1>
    
    <div class="test-case">
        <h2>Test Case 1: Inline Math with Single Dollar Signs</h2>
        <div class="compose-area" contenteditable="true">
            How do $$\sum_i p_i$$ and $\sum_i p_i$ look?
        </div>
    </div>

    <div class="test-case">
        <h2>Test Case 2: Display Math with Double Dollar Signs</h2>
        <div class="compose-area" contenteditable="true">
            The equation $$x^2 + y^2 = z^2$$ should be centered and large
        </div>
    </div>

    <div class="test-case">
        <h2>Test Case 3: Mixed Inline and Display</h2>
        <div class="compose-area" contenteditable="true">
            Inline math like $e^{i\pi} + 1 = 0$ flows with text, while
$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
is displayed prominently.
        </div>
    </div>

    <script>
      // Kick off LaTeX rendering for static compose areas
      window.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.compose-area').forEach(area => {
          if (typeof detectAndRenderLatex === 'function') {
            detectAndRenderLatex(area);
          }
        });
      });
    </script>
    
    <!-- Load the extension content script for local testing -->
    <script src="../src/content.js"></script>
</body>
</html>
```

## Key Observations

1. **The function IS being called** - I've verified through console logging
2. **The function finds text nodes** - `findTextNodes(rootElement)` returns nodes
3. **The regex patterns are defined** - `LATEX_PATTERNS` object exists
4. **BUT: No matches are found** - The regex patterns don't seem to match the LaTeX in the text nodes

## Debugging Attempts

```javascript
// Manual test in browser console on test-inline-display.html:
detectAndRenderLatex(document.querySelector('.compose-area'))
// Returns: false (no changes made)

// Check if function can see the text:
const area = document.querySelector('.compose-area');
const textNodes = findTextNodes(area);
textNodes[0].textContent
// Returns: "How do $$\sum_i p_i$$ and $\sum_i p_i$ look?"

// Test the regex directly:
const text = "How do $$\sum_i p_i$$ and $\sum_i p_i$ look?";
/\$\$([^\$]+?)\$\$/.test(text)
// Returns: true (regex works!)
```

## Suspected Issues

1. **Toggle State**: The function checks `getToggleState(rootElement)` - might be returning false for non-Gmail pages?
2. **LATEX_PATTERNS**: The regex patterns might not be initialized properly?
3. **findTextNodes**: Might be filtering out valid text nodes?
4. **isCurrency**: Might be incorrectly identifying LaTeX as currency?
5. **Parent node processing**: The `data-tex-processing-node` attribute logic might be skipping nodes?

## Required Help

**Primary Question**: Why is `detectAndRenderLatex()` not finding/rendering LaTeX equations in test pages when:
- The function is called correctly
- The text nodes contain valid LaTeX
- The regex patterns work when tested directly
- The same code works perfectly in the Gmail simulation page

**Specific Areas to Investigate**:
1. How to debug why regex matches aren't being found inside the forEach loop
2. Whether there's a dependency on Gmail-specific DOM structures
3. If the toggle state management is preventing rendering
4. Whether the text node filtering is too restrictive

## Additional Context

- This is a Chrome extension that normally runs in Gmail's context
- When testing locally with `file://` protocol, Chrome APIs aren't available (hence the storage errors)
- The extension exposes functions globally when detecting test pages (see line 2323-2336)
- The Gmail simulation page (test-gmail.html) has additional DOM structure that mimics Gmail's compose window

**Goal**: Make the LaTeX rendering work in simple test HTML pages without requiring Gmail's full DOM structure, so we can test the rendering logic independently.