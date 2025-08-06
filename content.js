// TeX for Gmail - Content Script
// Encapsulated in IIFE to avoid global namespace pollution
(function() {
  'use strict';

  // Configuration object for easy maintenance
  const CONFIG = {
    composeSelectors: [
      '[g_editable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '.editable[contenteditable="true"]',
      'div[aria-label*="Message Body"]'
    ],
    observerConfig: {
      childList: true,
      subtree: true
    },
    debounceDelay: 100, // For observer
    renderDebounceDelay: 500, // For LaTeX rendering
    toastDuration: 3000,
    dpi: {
      inline: 110,
      display: 150
    },
    size: {
      inline: '\\normalsize',
      display: '\\large'
    },
    maxApiCallsPerMinute: 60, // Rate limiting
    maxLatexLength: 1000 // Maximum LaTeX string length
  };

  // Main namespace object for state management
  const TeXForGmail = {
    observer: null,
    composeButtons: new WeakMap(),
    processingStates: new WeakMap(),
    composeObservers: new WeakMap(), // Track observers per compose area
    renderTimeouts: new WeakMap(), // Track render timeouts per compose area
    apiCallTimes: [], // Track API call timestamps for rate limiting
    debugMode: false, // Set to true for verbose logging
    init() {
      this.log('Extension initialized');
      this.setupObserver();
      // Check for existing compose windows immediately
      this.checkForComposeWindow();
    },
    log(message, ...args) {
      if (this.debugMode || message.includes('Error')) {
        console.log(`TeX for Gmail: ${message}`, ...args);
      }
    },
    // Rate limiting check
    checkRateLimit() {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      
      // Remove old timestamps
      this.apiCallTimes = this.apiCallTimes.filter(time => time > oneMinuteAgo);
      
      // Check if we're at the limit
      if (this.apiCallTimes.length >= CONFIG.maxApiCallsPerMinute) {
        this.log('Warning: API rate limit reached');
        return false;
      }
      
      // Add current timestamp
      this.apiCallTimes.push(now);
      return true;
    }
  };

  // Task 1: LaTeX Pattern Detection - Compile once for performance
  const LATEX_PATTERNS = {
    // Display math: $$...$$ (must be on same line, no nested $$)
    display: /\$\$([^\$\n]+?)\$\$/g,
    // Inline math: $...$ (must be on same line, no nested $, avoid currency)
    inline: /(?<!\$)\$(?!\d)([^\$\n]+?)\$(?!\d)/g,
    // Pattern to detect escaped dollar signs
    escaped: /\\\$/g
  };

  // LaTeX validation to prevent injection attacks
  function isValidLatex(latex) {
    // Basic validation - no script tags or suspicious patterns
    const dangerous = /<script|javascript:|on\w+=/i;
    return !dangerous.test(latex) && latex.length < CONFIG.maxLatexLength;
  }

  // Currency detection helper - Enhanced with more patterns
  function isCurrency(text) {
    // Check for common currency patterns like "$5", "$10.99", "$1,000", "$5-$10"
    const currencyPatterns = [
      /\$\d+(?:[,.\d]*)?(?:\s+(?:and|to|-|\+|or)\s+\$\d+(?:[,.\d]*)?)?/g,
      /\$\d+(?:[,.\d]*)?\/(?:hr|hour|day|week|month|year)/gi,
      /(?:USD|EUR|GBP)\s*\$?\d+/gi
    ];
    return currencyPatterns.some(pattern => pattern.test(text));
  }

  // Task 2: CodeCogs API Integration with validation and rate limiting
  function getCodeCogsUrl(latex, isDisplay) {
    // Validate LaTeX before sending to API
    if (!isValidLatex(latex)) {
      TeXForGmail.log('Invalid or dangerous LaTeX detected:', latex);
      return null;
    }
    
    // Check rate limit
    if (!TeXForGmail.checkRateLimit()) {
      TeXForGmail.log('Rate limit exceeded, skipping render');
      return null;
    }
    
    const encoded = encodeURIComponent(latex);
    const dpi = isDisplay ? CONFIG.dpi.display : CONFIG.dpi.inline;
    const size = isDisplay ? CONFIG.size.display : CONFIG.size.inline;
    return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${size}%20${encoded}`;
  }

  // Task 3: Rendering Pipeline - Text node traversal
  function findTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip if parent is already processed or is a script/style
          if (node.parentElement?.classList?.contains('tex-math-inline') ||
              node.parentElement?.classList?.contains('tex-math-display') ||
              node.parentElement?.tagName === 'SCRIPT' ||
              node.parentElement?.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          // Only process nodes with actual text content
          if (node.textContent.trim().length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    return textNodes;
  }

  // Task 3: Create wrapper element for rendered math
  function createMathWrapper(latex, isDisplay, imgUrl) {
    const wrapper = document.createElement('span');
    wrapper.className = isDisplay ? 'tex-math-display' : 'tex-math-inline';
    wrapper.setAttribute('data-latex', latex);
    wrapper.setAttribute('data-processed', 'true');
    
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = isDisplay ? `$$${latex}$$` : `$${latex}$`;
    img.style.verticalAlign = 'middle';
    
    // Error handling for image loading
    img.onerror = function() {
      TeXForGmail.log('Error: Failed to load LaTeX image', latex);
      // Replace with original text on error
      wrapper.textContent = isDisplay ? `$$${latex}$$` : `$${latex}$`;
      wrapper.classList.add('tex-render-error');
    };
    
    wrapper.appendChild(img);
    return wrapper;
  }

  // Task 3 & 7: Preserve cursor position during rendering
  function preserveCursorPosition(composeArea, callback) {
    const selection = window.getSelection();
    let cursorNode = null;
    let cursorOffset = 0;
    
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      cursorNode = range.startContainer;
      cursorOffset = range.startOffset;
    }
    
    callback();
    
    // Restore cursor position if possible
    if (cursorNode && document.contains(cursorNode)) {
      try {
        const newRange = document.createRange();
        newRange.setStart(cursorNode, Math.min(cursorOffset, cursorNode.length || 0));
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } catch (e) {
        TeXForGmail.log('Could not restore cursor position', e);
      }
    }
  }

  // Task 3, 5: Main rendering function - Optimized
  function detectAndRenderLatex(composeArea) {
    if (!composeArea) return false;

    const textNodes = findTextNodes(composeArea);
    let hasChanges = false;

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      
      // Skip if it looks like currency
      if (isCurrency(text)) {
        return;
      }

      // Check for display math first (higher priority)
      let lastIndex = 0;
      let match;
      const newNodes = [];
      let foundMath = false;

      // Process display math
      LATEX_PATTERNS.display.lastIndex = 0;
      while ((match = LATEX_PATTERNS.display.exec(text)) !== null) {
        foundMath = true;
        
        // Add text before the match
        if (match.index > lastIndex) {
          newNodes.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        
        // Create and add math element
        const latex = match[1];
        const imgUrl = getCodeCogsUrl(latex, true);
        if (imgUrl) {
          const mathElement = createMathWrapper(latex, true, imgUrl);
          newNodes.push(mathElement);
        } else {
          // Keep original text if validation fails
          newNodes.push(document.createTextNode(match[0]));
        }
        
        lastIndex = match.index + match[0].length;
      }

      // If no display math found, process inline math
      if (!foundMath) {
        LATEX_PATTERNS.inline.lastIndex = 0;
        lastIndex = 0;
        
        while ((match = LATEX_PATTERNS.inline.exec(text)) !== null) {
          foundMath = true;
          
          // Add text before the match
          if (match.index > lastIndex) {
            newNodes.push(document.createTextNode(text.substring(lastIndex, match.index)));
          }
          
          // Create and add math element
          const latex = match[1];
          const imgUrl = getCodeCogsUrl(latex, false);
          if (imgUrl) {
            const mathElement = createMathWrapper(latex, false, imgUrl);
            newNodes.push(mathElement);
          } else {
            // Keep original text if validation fails
            newNodes.push(document.createTextNode(match[0]));
          }
          
          lastIndex = match.index + match[0].length;
        }
      }

      // Add remaining text after last match
      if (foundMath) {
        if (lastIndex < text.length) {
          newNodes.push(document.createTextNode(text.substring(lastIndex)));
        }
        
        // Replace the text node with new nodes
        const parent = textNode.parentNode;
        newNodes.forEach(node => {
          parent.insertBefore(node, textNode);
        });
        parent.removeChild(textNode);
        hasChanges = true;
      }
    });

    return hasChanges;
  }

  // Task 3: Debounced render function - Per compose area
  function scheduleRender(composeArea) {
    const existingTimeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const newTimeout = setTimeout(() => {
      preserveCursorPosition(composeArea, () => {
        detectAndRenderLatex(composeArea);
      });
      TeXForGmail.renderTimeouts.delete(composeArea);
    }, CONFIG.renderDebounceDelay);
    
    TeXForGmail.renderTimeouts.set(composeArea, newTimeout);
  }

  // Debounce utility function
  function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // Create and show toast notification
  function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.tex-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `tex-toast tex-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#f44336' : '#333'};
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s;
    `;

    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, CONFIG.toastDuration);
  }

  // Find compose area with multiple selector strategies
  function findComposeArea() {
    for (const selector of CONFIG.composeSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        TeXForGmail.log(`Compose area found with selector: ${selector}`);
        return element;
      }
    }
    TeXForGmail.log('Compose area not found');
    return null;
  }

  // Create TeX button element
  function createTexButton() {
    const button = document.createElement('div');
    button.className = 'tex-button T-I J-J5-Ji aoO v7 T-I-atl L3';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Insert LaTeX equation');
    button.setAttribute('data-tooltip', 'Render LaTeX equations');
    button.style.cssText = 'user-select: none; margin: 0 8px; cursor: pointer;';
    button.innerHTML = '<div class="asa"><div class="a3I">📐 TeX</div></div>';
    
    return button;
  }

  // Task 6: Handle button click - Fixed memory leak
  function handleTexButtonClick(button) {
    // Prevent concurrent clicks
    if (TeXForGmail.processingStates.get(button)) {
      TeXForGmail.log('Already processing, ignoring click');
      return;
    }

    TeXForGmail.processingStates.set(button, true);
    
    // Update button state
    const buttonText = button.querySelector('.a3I');
    const originalText = buttonText.textContent;
    buttonText.textContent = 'Rendering...';
    button.style.cursor = 'wait';
    button.style.backgroundColor = '#f0f0f0';
    button.setAttribute('data-processing', 'true');

    const composeArea = findComposeArea();
    
    if (composeArea) {
      TeXForGmail.log('Rendering LaTeX in compose area');
      
      // Perform immediate render
      preserveCursorPosition(composeArea, () => {
        const hasChanges = detectAndRenderLatex(composeArea);
        
        // Reset button state
        setTimeout(() => {
          buttonText.textContent = originalText;
          button.style.cursor = 'pointer';
          button.style.backgroundColor = '';
          button.removeAttribute('data-processing');
          TeXForGmail.processingStates.set(button, false);
          
          if (hasChanges) {
            showToast('LaTeX equations rendered successfully');
          } else {
            showToast('No LaTeX equations found to render', 'info');
          }
        }, 300);
      });
      
      // Set up auto-render observer ONLY if not already set up
      if (!TeXForGmail.composeObservers.has(composeArea)) {
        setupAutoRenderObserver(composeArea);
      }
      
    } else {
      // Reset button state
      buttonText.textContent = originalText;
      button.style.cursor = 'pointer';
      button.style.backgroundColor = '';
      button.removeAttribute('data-processing');
      TeXForGmail.processingStates.set(button, false);
      
      showToast('Could not find compose area. Please try again.', 'error');
    }
  }

  // New function to properly manage auto-render observers
  function setupAutoRenderObserver(composeArea) {
    // Clean up any existing observer for this compose area
    const existingObserver = TeXForGmail.composeObservers.get(composeArea);
    if (existingObserver) {
      existingObserver.disconnect();
    }
    
    // Create new observer with proper debouncing
    const observer = new MutationObserver(debounce(() => {
      scheduleRender(composeArea);
    }, CONFIG.debounceDelay));
    
    observer.observe(composeArea, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Store observer reference for cleanup
    TeXForGmail.composeObservers.set(composeArea, observer);
    TeXForGmail.log('Auto-render observer set up for compose area');
  }

  // Cleanup function for compose area observers
  function cleanupComposeObserver(composeArea) {
    const observer = TeXForGmail.composeObservers.get(composeArea);
    if (observer) {
      observer.disconnect();
      TeXForGmail.composeObservers.delete(composeArea);
    }
    
    const timeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (timeout) {
      clearTimeout(timeout);
      TeXForGmail.renderTimeouts.delete(composeArea);
    }
  }

  // Add TeX button to compose window
  function addTexButton(composeElement) {
    // Find the toolbar - multiple possible selectors
    const toolbarSelectors = [
      '.aZ .J-J5-Ji',
      '.aZ .J-Z-I',
      '.gU .J-Z-I',
      '[gh="tl"] .J-J5-Ji'
    ];

    let toolbar = null;
    for (const selector of toolbarSelectors) {
      toolbar = composeElement.querySelector(selector);
      if (toolbar) break;
    }

    if (!toolbar) {
      // Try finding toolbar in parent elements
      const parent = composeElement.closest('.M9, .AD');
      if (parent) {
        for (const selector of toolbarSelectors) {
          toolbar = parent.querySelector(selector);
          if (toolbar) break;
        }
      }
    }

    if (!toolbar) {
      TeXForGmail.log('Toolbar not found in compose window');
      return;
    }

    // Check if button already exists using WeakMap
    if (TeXForGmail.composeButtons.has(toolbar)) {
      TeXForGmail.log('Button already exists for this toolbar');
      return;
    }

    const button = createTexButton();

    // Add click event listener
    button.addEventListener('click', () => handleTexButtonClick(button));
    
    // Add keyboard support
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTexButtonClick(button);
      }
    });

    // Insert button at the beginning of the toolbar
    toolbar.insertBefore(button, toolbar.firstChild);
    TeXForGmail.composeButtons.set(toolbar, button);
    TeXForGmail.log('Button added to compose toolbar');
  }

  // Check for compose windows
  function checkForComposeWindow() {
    // Look for all compose windows
    const composeWindows = document.querySelectorAll('.M9, .AD, .aoI');
    
    composeWindows.forEach(compose => {
      if (compose.querySelector('.aZ')) {
        addTexButton(compose);
      }
    });
  }

  // Set up mutation observer with debouncing
  TeXForGmail.setupObserver = function() {
    const debouncedCheck = debounce(checkForComposeWindow, CONFIG.debounceDelay);
    
    this.observer = new MutationObserver(debouncedCheck);
    this.observer.observe(document.body, CONFIG.observerConfig);
    TeXForGmail.log('Observer watching for compose windows');
  };

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (TeXForGmail.observer) {
      TeXForGmail.observer.disconnect();
      TeXForGmail.log('Main observer disconnected');
    }
    
    // Clean up all compose observers
    TeXForGmail.composeObservers.forEach((observer, composeArea) => {
      cleanupComposeObserver(composeArea);
    });
    
    // Clear any pending renders
    TeXForGmail.renderTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TeXForGmail.init());
  } else {
    TeXForGmail.init();
  }

})();