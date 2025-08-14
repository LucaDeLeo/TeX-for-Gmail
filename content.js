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
      inline: 200,
      display: 300
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
    toggleStates: new WeakMap(), // Track toggle state per compose area
    originalContent: new WeakMap(), // Store original content before rendering
    removalObservers: new WeakMap(), // Track removal observers for cleanup
    sendProcessingStates: new WeakMap(), // Track send processing states
    observerSetupFlags: new WeakMap(), // Prevent duplicate observer setup
    apiCallTimes: [], // Track API call timestamps for rate limiting
    debugMode: true, // Set to true for verbose logging (temporarily enabled for debugging)
    simpleMode: false, // Simple Math mode flag
    naiveTexMode: false, // Naive TeX detection mode flag
    serverPreference: 'codecogs', // Current server preference
    serverSwitchMutex: false, // Mutex to prevent concurrent server switches
    serverSwitchTimestamp: 0, // Track last switch time
    init() {
      console.log('🚀 TeX for Gmail: Extension initializing...');
      this.log('Extension initialized');
      
      // Load server preference from sessionStorage
      try {
        const savedPreference = sessionStorage.getItem('tex-gmail-server-preference');
        if (savedPreference && ['codecogs', 'wordpress'].includes(savedPreference)) {
          this.serverPreference = savedPreference;
          this.log('Loaded server preference:', savedPreference);
        }
      } catch (e) {
        // Silently fail if sessionStorage is not available
        this.log('Could not load server preference from sessionStorage');
      }
      
      this.setupObserver();
      // Check for existing compose windows immediately
      checkForComposeWindow();
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

  // Task 1 (Story 1.3): Toggle State Management Functions
  function getToggleState(composeArea) {
    // Get toggle state for a compose area, default to true (active/rendering enabled)
    if (!TeXForGmail.toggleStates.has(composeArea)) {
      TeXForGmail.toggleStates.set(composeArea, true);
    }
    return TeXForGmail.toggleStates.get(composeArea);
  }

  function setToggleState(composeArea, state) {
    TeXForGmail.toggleStates.set(composeArea, state);
    TeXForGmail.log(`Toggle state set to ${state ? 'active' : 'inactive'} for compose area`);
  }

  function cleanupToggleState(composeArea) {
    if (TeXForGmail.toggleStates.has(composeArea)) {
      TeXForGmail.toggleStates.delete(composeArea);
      TeXForGmail.log('Toggle state cleaned up for compose area');
    }
  }

  // Task 2 (Story 1.3): Button Visual State Management
  function updateButtonVisualState(button, isActive) {
    // Fixed: Ensure visual state matches actual toggle state
    if (isActive) {
      button.setAttribute('data-toggle-state', 'active');
      button.setAttribute('data-tooltip', 'LaTeX rendering is ON - Click to toggle OFF');
      button.style.background = '#4CAF50';
      button.innerHTML = '📐 TeX ON';
    } else {
      button.setAttribute('data-toggle-state', 'inactive');
      button.setAttribute('data-tooltip', 'LaTeX rendering is OFF - Click to toggle ON');
      button.style.background = '#9e9e9e';
      button.innerHTML = '📐 TeX OFF';
    }
  }

  function getButtonForComposeArea(composeArea) {
    // Find the button associated with a compose area
    const parent = composeArea.closest('.M9, .AD');
    if (parent) {
      const toolbar = parent.querySelector('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
      if (toolbar) {
        return TeXForGmail.composeButtons.get(toolbar);
      }
    }
    return null;
  }

  // Robust restore function using saved snapshots
  function restoreLatexSource(composeArea) {
    // Safety check to prevent accidental text deletion
    if (!composeArea || !composeArea.isConnected) {
      TeXForGmail.log('Warning: Invalid compose area for restore operation');
      return false;
    }
    
    // Get the saved original content
    const originalHTML = TeXForGmail.originalContent.get(composeArea);
    
    if (!originalHTML && originalHTML !== '') {
      TeXForGmail.log('Warning: No original content saved for this compose area');
      // Fallback: Try to restore individual elements (old method as backup)
      const renderedElements = composeArea.querySelectorAll('.tex-math-inline, .tex-math-display');
      if (renderedElements.length === 0) {
        TeXForGmail.log('No rendered elements to restore and no saved content');
        return false;
      }
      
      // Only use the old method if we have rendered elements but no saved content
      TeXForGmail.log('Falling back to element-by-element restoration');
      let restoredCount = 0;
      renderedElements.forEach(element => {
        // Task 3 (Story 2.2): Use extractSourceFromElement for attribute-based restoration
        // First try to get source from img element inside the wrapper
        const img = element.querySelector('img');
        let latexSource = null;
        
        if (img) {
          // Extract from img attributes using the new function
          latexSource = extractSourceFromElement(img);
        }
        
        // Fallback to wrapper's data-latex if img extraction failed
        // This handles legacy rendered elements from earlier versions
        if (!latexSource || latexSource === '[LaTeX source lost]') {
          const latex = element.getAttribute('data-latex');
          if (latex) {
            const isDisplay = element.classList.contains('tex-math-display');
            latexSource = isDisplay ? `$$${latex}$$` : `$${latex}$`;
            TeXForGmail.log('Recovered source from wrapper element (legacy fallback)');
          }
        }
        
        if (latexSource && latexSource !== '[LaTeX source lost]' && element.parentNode) {
          const textNode = document.createTextNode(latexSource);
          element.parentNode.replaceChild(textNode, element);
          restoredCount++;
        }
      });
      if (restoredCount > 0) {
        composeArea.normalize();
      }
      return restoredCount > 0;
    }
    
    // For Gmail, we need to handle content restoration carefully
    TeXForGmail.log('Restoring original content from snapshot');
    
    try {
      // First, try direct innerHTML restoration
      composeArea.innerHTML = originalHTML;
      
      // Check if content was restored properly
      if (composeArea.innerHTML.trim() === '' && originalHTML.trim() !== '') {
        // Gmail might have rejected the HTML, try a different approach
        TeXForGmail.log('Direct innerHTML restoration failed, trying text-based approach');
        
        // Extract text content from the saved HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = originalHTML;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        
        if (textContent.trim()) {
          // For Gmail, wrap content in divs as it expects
          const lines = textContent.split('\n');
          composeArea.innerHTML = '';
          
          lines.forEach(line => {
            if (line.trim()) {
              const div = document.createElement('div');
              div.textContent = line;
              composeArea.appendChild(div);
            } else {
              // Empty line - add a div with br
              const div = document.createElement('div');
              div.appendChild(document.createElement('br'));
              composeArea.appendChild(div);
            }
          });
          
          TeXForGmail.log('Content restored using Gmail-compatible div structure');
        }
      }
      
      // Final safety check
      if (composeArea.textContent.trim() === '' && originalHTML.trim() !== '') {
        TeXForGmail.log('ERROR: Content restoration failed - compose area is empty');
        // Last resort: set as plain text
        composeArea.textContent = originalHTML.replace(/<[^>]*>/g, '');
      }
      
    } catch (error) {
      TeXForGmail.log('Error during content restoration:', error);
      // Fallback to text content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = originalHTML;
      composeArea.textContent = tempDiv.textContent || originalHTML;
    }
    
    // DO NOT delete the saved content - we need it for multiple toggle cycles
    // The saved content will be cleared when the compose area is removed from DOM
    TeXForGmail.log('Original content restored (keeping snapshot for future restores)');
    
    return true;
  }

  function rerenderAllLatex(composeArea) {
    // Re-render all LaTeX when toggling on
    // Don't preserve cursor here - it's already done in toggleRendering
    const hasChanges = detectAndRenderLatex(composeArea);
    TeXForGmail.log(`Re-rendered LaTeX, changes: ${hasChanges}`);
    return hasChanges;
  }

  function toggleRendering(composeArea) {
    const currentState = getToggleState(composeArea);
    const newState = !currentState;
    
    TeXForGmail.log(`Toggle: current=${currentState}, new=${newState}`);
    
    // Update toggle state
    setToggleState(composeArea, newState);
    
    // Update button visual state
    const button = getButtonForComposeArea(composeArea);
    if (button) {
      updateButtonVisualState(button, newState);
    }
    
    if (newState) {
      // Toggle ON: Save original content ONLY if this is the first time enabling for this compose area
      const currentContent = composeArea.innerHTML;
      const currentTextContent = composeArea.textContent || '';
      
      // Only save if we don't already have saved content (this ensures we keep the ORIGINAL content)
      if (!TeXForGmail.originalContent.has(composeArea)) {
        TeXForGmail.log(`Saving ORIGINAL content snapshot (first time enabling) - ${currentContent.length} chars HTML, ${currentTextContent.length} chars text`);
        TeXForGmail.originalContent.set(composeArea, currentContent);
      } else {
        TeXForGmail.log(`Using existing saved content (not overwriting) - toggle count preserved`);
      }
      
      // Set up observer for future changes
      setupAutoRenderObserver(composeArea);
      
      // Check if there's actual LaTeX source to render
      const hasLatexSource = /\$\$[^$\n]+\$\$/.test(currentTextContent) || 
                            (/(?<!\$)\$(?!\d)([^$\n]+?)\$(?!\d)/.test(currentTextContent) && 
                             !isCurrency(currentTextContent));
      
      if (hasLatexSource) {
        preserveCursorPosition(composeArea, () => {
          rerenderAllLatex(composeArea);
        });
      }
      showToast('LaTeX rendering ON');
    } else {
      // Toggle OFF: Stop observer and restore original content
      const observer = TeXForGmail.composeObservers.get(composeArea);
      if (observer) {
        observer.disconnect();
        TeXForGmail.composeObservers.delete(composeArea);
        TeXForGmail.log('Observer disconnected - toggle is OFF');
      }
      
      // Debug logging before restoration
      const currentContent = composeArea.innerHTML;
      const currentTextContent = composeArea.textContent || '';
      TeXForGmail.log(`Before restore: ${currentContent.length} chars HTML, ${currentTextContent.length} chars text`);
      
      // Always try to restore if we have saved content
      const hasSavedContent = TeXForGmail.originalContent.has(composeArea);
      const hasRenderedLatex = composeArea.querySelectorAll('.tex-math-inline, .tex-math-display').length > 0;
      
      TeXForGmail.log(`Restore check: hasSavedContent=${hasSavedContent}, hasRenderedLatex=${hasRenderedLatex}`);
      
      if (hasSavedContent || hasRenderedLatex) {
        // Don't use preserveCursorPosition for restoration as it can cause issues
        const restored = restoreLatexSource(composeArea);
        
        // Debug logging after restoration
        const afterContent = composeArea.innerHTML;
        const afterTextContent = composeArea.textContent || '';
        TeXForGmail.log(`After restore: ${afterContent.length} chars HTML, ${afterTextContent.length} chars text`);
        
        if (restored && afterTextContent.trim()) {
          showToast('LaTeX source restored');
        } else if (!afterTextContent.trim()) {
          TeXForGmail.log('ERROR: Content appears empty after restoration!');
          showToast('Error: Content restoration failed - please check console');
        } else {
          showToast('LaTeX rendering OFF');
        }
      } else {
        showToast('LaTeX rendering OFF');
      }
    }
    
    return newState;
  }

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
    // Check length first (prevent regex DoS)
    if (latex.length >= CONFIG.maxLatexLength) {
      return false;
    }
    // Basic validation - no script tags or suspicious patterns
    const dangerous = /<script|javascript:|on\w+=/i;
    return !dangerous.test(latex);
  }

  // Currency patterns compiled once for performance
  const CURRENCY_PATTERNS = [
    /\$\d+(?:[,.\d]*)?(?:\s+(?:and|to|-|\+|or)\s+\$\d+(?:[,.\d]*)?)?/,
    /\$\d+(?:[,.\d]*)?\/(?:hr|hour|day|week|month|year)/i,
    /(?:USD|EUR|GBP)\s*\$?\d+/i,
    /\$\d+\.\d{2}(?:\s|$)/, // Prices like $9.99
    /\$\d{1,3}(?:,\d{3})+/ // Formatted amounts like $1,000
  ];
  
  // Currency detection helper - Enhanced with more patterns
  function isCurrency(text) {
    // Quick check for dollar sign followed by digit
    if (!/\$\d/.test(text)) {
      return false;
    }
    // Check against currency patterns
    return CURRENCY_PATTERNS.some(pattern => pattern.test(text));
  }

  // Task 2: CodeCogs API Integration with validation and rate limiting
  function getCodeCogsUrl(latex, isDisplay) {
    // Validate LaTeX before sending to API
    if (!isValidLatex(latex)) {
      TeXForGmail.log('Invalid or dangerous LaTeX detected:', latex);
      return null;
    }
    
    // Check rate limit AFTER validation (don't count invalid requests)
    if (!TeXForGmail.checkRateLimit()) {
      TeXForGmail.log('Rate limit exceeded, skipping render');
      return null;
    }
    
    const encoded = encodeURIComponent(latex);
    const dpi = isDisplay ? CONFIG.dpi.display : CONFIG.dpi.inline;
    const displayPrefix = isDisplay ? '\\displaystyle' : '\\inline';
    return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${displayPrefix}%20${encoded}`;
  }

  // WordPress Server as Fallback (Task 6)
  function getWordPressUrl(latex) {
    const encoded = encodeURIComponent(latex);
    return `https://s0.wp.com/latex.php?latex=${encoded}&bg=ffffff&fg=000000&s=0`;
  }

  // Server Health Monitoring (Task 7)
  const ServerHealth = {
    codecogs: { failures: 0, lastCheck: 0 },
    wordpress: { failures: 0, lastCheck: 0 },
    resetThreshold: 300000, // 5 minutes
    maxFailures: 3
  };

  function checkServerHealth(server) {
    const now = Date.now();
    const health = ServerHealth[server];
    
    // Reset counter if enough time passed
    if (now - health.lastCheck > ServerHealth.resetThreshold) {
      health.failures = 0;
    }
    health.lastCheck = now;
    
    return health.failures < ServerHealth.maxFailures;
  }

  // Safe server switching with mutex protection
  function switchServerSafely(newServer, reason = '') {
    // Check if switch is already in progress
    if (TeXForGmail.serverSwitchMutex) {
      TeXForGmail.log('Server switch already in progress, skipping');
      return false;
    }

    // Prevent switching too frequently (within 5 seconds)
    const now = Date.now();
    if (now - TeXForGmail.serverSwitchTimestamp < 5000) {
      TeXForGmail.log('Server switch attempted too soon, skipping');
      return false;
    }

    // Acquire mutex
    TeXForGmail.serverSwitchMutex = true;
    TeXForGmail.serverSwitchTimestamp = now;

    try {
      // Only switch if actually changing
      if (TeXForGmail.serverPreference === newServer) {
        TeXForGmail.log('Server already set to', newServer);
        return false;
      }

      // Perform the switch
      TeXForGmail.serverPreference = newServer;
      
      // Persist to sessionStorage with error handling
      try {
        sessionStorage.setItem('tex-gmail-server-preference', newServer);
      } catch (e) {
        TeXForGmail.log('Could not save server preference to sessionStorage:', e);
      }

      TeXForGmail.log(`Server switched to ${newServer}${reason ? ': ' + reason : ''}`);
      
      // Show user notification
      const message = newServer === 'wordpress' 
        ? 'Switching to backup math server...' 
        : 'Switching to primary math server...';
      showToast(message, 'info');
      
      return true;
    } finally {
      // Always release mutex
      setTimeout(() => {
        TeXForGmail.serverSwitchMutex = false;
      }, 100); // Small delay to prevent immediate re-entry
    }
  }

  // Simple Math Mode Implementation (Task 4)
  function sanitizeForHTML(text) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;',
      '(': '&#40;',
      ')': '&#41;',
      '[': '&#91;',
      ']': '&#93;',
      '{': '&#123;',
      '}': '&#125;',
      '\\': '&#92;',
      '|': '&#124;',
      '*': '&#42;',
      '+': '&#43;',
      '?': '&#63;',
      '.': '&#46;',
      '^': '&#94;',
      '$': '&#36;'
    };
    return text.replace(/[&<>"'\/`=()[\]{}\\|*+?.^$]/g, char => escapeMap[char]);
  }

  function createSafeElement(tag, content, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  }

  function renderSimpleMath(latex, isDisplay) {
    // Greek letter mapping
    const greekLetters = {
      '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
      '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
      '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
      '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
      '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
      '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
      '\\Alpha': 'Α', '\\Beta': 'Β', '\\Gamma': 'Γ', '\\Delta': 'Δ',
      '\\Epsilon': 'Ε', '\\Zeta': 'Ζ', '\\Eta': 'Η', '\\Theta': 'Θ',
      '\\Iota': 'Ι', '\\Kappa': 'Κ', '\\Lambda': 'Λ', '\\Mu': 'Μ',
      '\\Nu': 'Ν', '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Rho': 'Ρ',
      '\\Sigma': 'Σ', '\\Tau': 'Τ', '\\Upsilon': 'Υ', '\\Phi': 'Φ',
      '\\Chi': 'Χ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
      '\\sum': '∑', '\\int': '∫', '\\prod': '∏', '\\sqrt': '√',
      '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\pm': '±',
      '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\leq': '≤',
      '\\geq': '≥', '\\neq': '≠', '\\approx': '≈', '\\equiv': '≡',
      '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
      '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅', '\\forall': '∀',
      '\\exists': '∃', '\\rightarrow': '→', '\\leftarrow': '←',
      '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\leftrightarrow': '↔'
    };

    try {
      // Create wrapper span
      const wrapper = document.createElement('span');
      wrapper.className = isDisplay ? 'tex-math-display' : 'tex-math-inline';
      wrapper.setAttribute('data-latex', latex);
      wrapper.setAttribute('data-display', isDisplay);
      wrapper.setAttribute('data-render-mode', 'simple');
      
      // Process the latex string
      let processedLatex = latex;
      
      // Replace Greek letters and symbols
      for (const [tex, symbol] of Object.entries(greekLetters)) {
        const regex = new RegExp(tex.replace(/\\/g, '\\\\'), 'g');
        processedLatex = processedLatex.replace(regex, symbol);
      }
      
      // Parse and create DOM structure
      const container = document.createElement('span');
      container.style.fontFamily = 'serif';
      container.style.fontSize = isDisplay ? '1.2em' : '1em';
      
      // Process superscripts and subscripts
      const parts = [];
      let currentText = '';
      let i = 0;
      
      while (i < processedLatex.length) {
        const char = processedLatex[i];
        
        if (char === '^') {
          // Handle superscript
          if (currentText) {
            parts.push({ type: 'text', content: currentText });
            currentText = '';
          }
          i++;
          let supContent = '';
          if (processedLatex[i] === '{') {
            // Find matching closing brace
            i++;
            let braceCount = 1;
            while (i < processedLatex.length && braceCount > 0) {
              if (processedLatex[i] === '{') braceCount++;
              else if (processedLatex[i] === '}') braceCount--;
              if (braceCount > 0) supContent += processedLatex[i];
              i++;
            }
          } else {
            // Single character superscript
            supContent = processedLatex[i];
            i++;
          }
          parts.push({ type: 'sup', content: supContent });
        } else if (char === '_') {
          // Handle subscript
          if (currentText) {
            parts.push({ type: 'text', content: currentText });
            currentText = '';
          }
          i++;
          let subContent = '';
          if (processedLatex[i] === '{') {
            // Find matching closing brace
            i++;
            let braceCount = 1;
            while (i < processedLatex.length && braceCount > 0) {
              if (processedLatex[i] === '{') braceCount++;
              else if (processedLatex[i] === '}') braceCount--;
              if (braceCount > 0) subContent += processedLatex[i];
              i++;
            }
          } else {
            // Single character subscript
            subContent = processedLatex[i];
            i++;
          }
          parts.push({ type: 'sub', content: subContent });
        } else {
          currentText += char;
          i++;
        }
      }
      
      if (currentText) {
        parts.push({ type: 'text', content: currentText });
      }
      
      // Build DOM from parts
      parts.forEach(part => {
        if (part.type === 'text') {
          const textNode = document.createTextNode(part.content);
          container.appendChild(textNode);
        } else if (part.type === 'sup') {
          const sup = createSafeElement('sup', part.content);
          container.appendChild(sup);
        } else if (part.type === 'sub') {
          const sub = createSafeElement('sub', part.content);
          container.appendChild(sub);
        }
      });
      
      wrapper.appendChild(container);
      return wrapper;
      
    } catch (error) {
      TeXForGmail.log('Error in renderSimpleMath:', error);
      return null;
    }
  }

  // Naive TeX Detection and Rendering (Task 5)
  function detectNaiveTeX(text) {
    // Patterns for naive TeX detection
    const patterns = [
      /\b([a-zA-Z])\^(\{[^}]+\}|\w+)/g,  // x^2 or x^{10}
      /\b([a-zA-Z])_(\{[^}]+\}|\w+)/g,   // a_n or a_{10}
      /\be\^\(([^)]+)\)/g,                // e^(i*pi)
      /\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega)/gi
    ];
    
    // Check if text contains potential naive TeX (avoid false positives with currency)
    const currencyPattern = /\$[\d,]+\.?\d*/g;
    const hasCurrency = currencyPattern.test(text);
    
    if (hasCurrency) {
      // Skip if text primarily contains currency
      return null;
    }
    
    // Check if any pattern matches
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return text;  // Return the text for processing
      }
    }
    
    return null;
  }

  // Task 3: Rendering Pipeline - Text node traversal with double-render prevention
  function findTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip if parent is already processed or is a script/style/code/pre element
          if (node.parentElement?.classList?.contains('tex-math-inline') ||
              node.parentElement?.classList?.contains('tex-math-display') ||
              node.parentElement?.classList?.contains('tex-render-error') ||
              node.parentElement?.getAttribute('data-processed') === 'true' ||
              node.parentElement?.tagName === 'SCRIPT' ||
              node.parentElement?.tagName === 'STYLE' ||
              node.parentElement?.tagName === 'CODE' ||
              node.parentElement?.tagName === 'PRE') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if this is alt text from a math image
          if (node.parentElement?.tagName === 'IMG' && 
              node.parentElement?.alt?.match(/^\$+.*\$+$/)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if parent or any ancestor is being processed or is a code/pre element
          let ancestor = node.parentElement;
          while (ancestor && ancestor !== element) {
            if (ancestor.getAttribute('data-tex-processing') === 'true' ||
                ancestor.tagName === 'CODE' ||
                ancestor.tagName === 'PRE' ||
                ancestor.tagName === 'TT') {
              return NodeFilter.FILTER_REJECT;
            }
            ancestor = ancestor.parentElement;
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
  // Task 1 (Story 2.2): Enhanced with self-documenting attributes
  function createMathWrapper(latex, isDisplay, imgUrl) {
    const wrapper = document.createElement('span');
    wrapper.className = isDisplay ? 'tex-math-display' : 'tex-math-inline';
    wrapper.setAttribute('data-latex', latex);
    wrapper.setAttribute('data-processed', 'true');
    wrapper.setAttribute('data-tex-toggled', 'rendered'); // Task 4 (Story 1.3): Track element state
    
    const img = document.createElement('img');
    img.src = imgUrl;
    
    // Story 2.2: Self-documenting attributes
    // Primary source - survives everything including copy/paste
    img.alt = isDisplay ? `$$${latex}$$` : `$${latex}$`;
    
    // User tooltip - helpful hint
    img.title = `LaTeX: ${img.alt}`;
    
    // Task 4 (Story 2.2): Progressive enhancement with dataset support check
    // Clean source for extension (no delimiters)
    if ('dataset' in img) {
      img.setAttribute('data-latex', latex);
      
      // Display type
      img.setAttribute('data-display', isDisplay ? 'block' : 'inline');
      
      // Track when rendered
      img.setAttribute('data-timestamp', Date.now().toString());
      
      // Extension version
      img.setAttribute('data-version', '1.0.0');
    } else {
      // Fallback for browsers without dataset support
      // Store in standard attributes with prefix
      img.setAttribute('tex-latex', latex);
      img.setAttribute('tex-display', isDisplay ? 'block' : 'inline');
      TeXForGmail.log('Using fallback attributes - dataset not supported');
    }
    
    // CSS class for consistent styling
    img.className = 'tex-rendered';
    
    // Prevent cursor issues in Gmail composer
    img.contentEditable = false;
    
    // Consistent styling
    img.style.verticalAlign = 'middle';
    img.style.cursor = 'pointer';
    
    // Error handling for image loading with improved user feedback
    img.onerror = function() {
      TeXForGmail.log('Error: Failed to load LaTeX image', latex);
      
      // Track server failure
      if (img.src.includes('codecogs.com')) {
        ServerHealth.codecogs.failures++;
        TeXForGmail.log('CodeCogs server failure count:', ServerHealth.codecogs.failures);
      } else if (img.src.includes('wp.com')) {
        ServerHealth.wordpress.failures++;
        TeXForGmail.log('WordPress server failure count:', ServerHealth.wordpress.failures);
      }
      
      // Replace with original text on error
      const sourceText = isDisplay ? `$$${latex}$$` : `$${latex}$`;
      wrapper.textContent = sourceText;
      wrapper.classList.add('tex-render-error');
      wrapper.setAttribute('title', 'Failed to render LaTeX - showing source');
      // Store the source in localStorage as backup for failed renders
      try {
        if (typeof localStorage !== 'undefined' && img.src) {
          localStorage.setItem(`tex_${img.src}`, sourceText);
        }
      } catch (e) {
        // Silently fail if localStorage is not available
      }
    };
    
    // Track successful loads to reset failure counts
    img.onload = function() {
      if (img.src.includes('codecogs.com')) {
        ServerHealth.codecogs.failures = 0;
      } else if (img.src.includes('wp.com')) {
        ServerHealth.wordpress.failures = 0;
      }
    };
    
    wrapper.appendChild(img);
    return wrapper;
  }

  // Task 2 (Story 2.2): Extract LaTeX source from element with multiple fallbacks
  // Task 4 (Story 2.2): Enhanced with progressive enhancement support
  function extractSourceFromElement(element) {
    // Early return for null/undefined elements
    if (!element) {
      TeXForGmail.log('extractSourceFromElement: null element provided');
      return '[LaTeX source lost]';
    }
    
    // Priority 1: Check data-latex attribute and add appropriate delimiters
    // Most modern browsers will hit this path for maximum performance
    if (element.dataset?.latex) {
      const display = element.dataset.display === 'block' ? '$$' : '$';
      return `${display}${element.dataset.latex}${display}`;
    }
    
    // Priority 2: Check alt attribute (already has delimiters) - always present as primary fallback
    // This is the most reliable fallback and should be checked early
    if (element.alt) {
      return element.alt;
    }
    
    // Fallback for browsers without dataset support
    if (element.getAttribute) {
      const texLatex = element.getAttribute('tex-latex');
      if (texLatex) {
        const texDisplay = element.getAttribute('tex-display');
        const display = texDisplay === 'block' ? '$$' : '$';
        return `${display}${texLatex}${display}`;
      }
    }
    
    // Priority 3: Check title attribute and remove "LaTeX: " prefix
    if (element.title?.startsWith('LaTeX: ')) {
      return element.title.substring(7);
    }
    
    // Priority 4: Check localStorage (with safe try-catch)
    // This is expensive so we check it last
    try {
      if (typeof localStorage !== 'undefined' && element.src) {
        const cached = localStorage.getItem(`tex_${element.src}`);
        if (cached) {
          TeXForGmail.log('Source recovered from localStorage cache');
          return cached;
        }
      }
    } catch (e) {
      // localStorage might not be available or accessible
      TeXForGmail.log('localStorage not available for source extraction');
    }
    
    // Last resort - source is lost
    TeXForGmail.log('WARNING: LaTeX source could not be extracted from element');
    return '[LaTeX source lost]';
  }

  // Helper function to calculate absolute character offset from start of container
  function calculateAbsoluteOffset(container, targetNode, targetOffset) {
    let absoluteOffset = 0;
    let found = false;
    
    function traverse(node) {
      if (found) return;
      
      if (node === targetNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          absoluteOffset += targetOffset;
        } else {
          // For element nodes, count characters in child nodes up to targetOffset
          for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
            traverse(node.childNodes[i]);
          }
        }
        found = true;
        return;
      }
      
      if (node.nodeType === Node.TEXT_NODE) {
        absoluteOffset += node.textContent.length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Handle special elements
        if (node.tagName === 'BR') {
          absoluteOffset += 1; // Count BR as one character
        } else if (node.classList && (node.classList.contains('tex-math-inline') || 
                                      node.classList.contains('tex-math-display'))) {
          // Count rendered math by its LaTeX source length
          const latex = node.getAttribute('data-latex');
          if (latex) {
            const isDisplay = node.classList.contains('tex-math-display');
            absoluteOffset += (isDisplay ? latex.length + 4 : latex.length + 2); // Include delimiters
          }
        } else {
          // Traverse child nodes
          for (let i = 0; i < node.childNodes.length; i++) {
            traverse(node.childNodes[i]);
            if (found) return;
          }
        }
      }
    }
    
    traverse(container);
    return absoluteOffset;
  }
  
  // Helper function to find node and offset from absolute position
  function findNodeAndOffsetFromAbsolute(container, targetOffset) {
    let currentOffset = 0;
    let resultNode = null;
    let resultOffset = 0;
    
    function traverse(node) {
      if (resultNode) return;
      
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent.length;
        if (currentOffset + length >= targetOffset) {
          resultNode = node;
          resultOffset = targetOffset - currentOffset;
          return;
        }
        currentOffset += length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Handle special elements
        if (node.tagName === 'BR') {
          if (currentOffset + 1 >= targetOffset) {
            // Position cursor before BR
            resultNode = node.parentNode;
            const index = Array.from(node.parentNode.childNodes).indexOf(node);
            resultOffset = index;
            return;
          }
          currentOffset += 1;
        } else if (node.classList && (node.classList.contains('tex-math-inline') || 
                                      node.classList.contains('tex-math-display'))) {
          // Handle rendered math element
          const latex = node.getAttribute('data-latex');
          if (latex) {
            const isDisplay = node.classList.contains('tex-math-display');
            const totalLength = isDisplay ? latex.length + 4 : latex.length + 2;
            if (currentOffset + totalLength >= targetOffset) {
              // Position cursor after the math element
              resultNode = node.parentNode;
              const index = Array.from(node.parentNode.childNodes).indexOf(node);
              resultOffset = index + 1;
              return;
            }
            currentOffset += totalLength;
          }
        } else {
          // Traverse child nodes
          for (let i = 0; i < node.childNodes.length; i++) {
            traverse(node.childNodes[i]);
            if (resultNode) return;
          }
        }
      }
    }
    
    traverse(container);
    
    // Fallback: if we couldn't find exact position, position at the end
    if (!resultNode) {
      const textNodes = findTextNodes(container);
      if (textNodes.length > 0) {
        const lastTextNode = textNodes[textNodes.length - 1];
        resultNode = lastTextNode;
        resultOffset = lastTextNode.textContent.length;
      } else {
        // Last resort: position at the end of container
        resultNode = container;
        resultOffset = container.childNodes.length;
      }
    }
    
    return { node: resultNode, offset: resultOffset };
  }
  
  // Enhanced cursor preservation with absolute position calculation
  function preserveCursorPosition(composeArea, callback) {
    const selection = window.getSelection();
    let absoluteStartOffset = -1;
    let absoluteEndOffset = -1;
    let hasSelection = false;
    let hasFocus = false;
    
    // Check if the compose area has focus
    hasFocus = composeArea.contains(document.activeElement) || composeArea === document.activeElement;
    
    if (selection.rangeCount > 0 && hasFocus) {
      const range = selection.getRangeAt(0);
      // Only preserve if cursor is within the compose area
      if (composeArea.contains(range.startContainer) && composeArea.contains(range.endContainer)) {
        // Calculate absolute positions
        absoluteStartOffset = calculateAbsoluteOffset(composeArea, range.startContainer, range.startOffset);
        absoluteEndOffset = calculateAbsoluteOffset(composeArea, range.endContainer, range.endOffset);
        hasSelection = !range.collapsed;
      }
    }
    
    const result = callback();
    
    // Restore cursor/selection using absolute positions
    if (absoluteStartOffset >= 0 && hasFocus) {
      try {
        const startPosition = findNodeAndOffsetFromAbsolute(composeArea, absoluteStartOffset);
        const newRange = document.createRange();
        
        // Set start position
        if (startPosition.node) {
          // Validate offset for the node type
          const maxOffset = startPosition.node.nodeType === Node.TEXT_NODE
            ? startPosition.node.textContent.length
            : startPosition.node.childNodes.length;
          newRange.setStart(startPosition.node, Math.min(startPosition.offset, maxOffset));
          
          // Set end position if there was a selection
          if (hasSelection && absoluteEndOffset >= 0) {
            const endPosition = findNodeAndOffsetFromAbsolute(composeArea, absoluteEndOffset);
            if (endPosition.node) {
              const maxEndOffset = endPosition.node.nodeType === Node.TEXT_NODE
                ? endPosition.node.textContent.length
                : endPosition.node.childNodes.length;
              newRange.setEnd(endPosition.node, Math.min(endPosition.offset, maxEndOffset));
            } else {
              newRange.collapse(true);
            }
          } else {
            newRange.collapse(true);
          }
          
          selection.removeAllRanges();
          selection.addRange(newRange);
          
          // Refocus the compose area if needed
          if (document.activeElement !== composeArea) {
            composeArea.focus();
          }
        }
      } catch (e) {
        TeXForGmail.log('Could not restore cursor position:', e);
        // Fallback: try to at least focus the compose area
        if (document.activeElement !== composeArea) {
          try {
            composeArea.focus();
          } catch (focusError) {
            TeXForGmail.log('Could not focus compose area:', focusError);
          }
        }
      }
    }
    
    return result;
  }

  // Task 3, 5: Main rendering function with double-render prevention
  function detectAndRenderLatex(composeArea) {
    if (!composeArea) return false;
    
    // Prevent concurrent rendering on same compose area
    if (composeArea.getAttribute('data-tex-processing') === 'true') {
      TeXForGmail.log('Already processing this compose area, skipping');
      return false;
    }
    
    // Task 4 (Story 1.3): Check toggle state before rendering
    const isRenderingEnabled = getToggleState(composeArea);
    if (!isRenderingEnabled) {
      TeXForGmail.log('Rendering disabled by toggle, skipping');
      return false;
    }
    
    // Set processing flag
    composeArea.setAttribute('data-tex-processing', 'true');
    
    try {
      const textNodes = findTextNodes(composeArea);
      let hasChanges = false;

      textNodes.forEach(textNode => {
        // Skip if parent was marked as processed during this render cycle
        if (textNode.parentNode?.getAttribute('data-tex-processing-node') === 'true') {
          return;
        }
        
        const text = textNode.textContent;
        
        // Skip if it looks like currency
        if (isCurrency(text)) {
          return;
        }
        
        // Skip if this is alt text from existing math image
        if (text.match(/^\$+.*\$+$/) && textNode.parentNode?.querySelector('img[alt*="$"]')) {
          return;
        }

        // Process both display and inline math in a single pass
        const matches = [];
        let match;
        
        // Find all display math matches
        LATEX_PATTERNS.display.lastIndex = 0;
        while ((match = LATEX_PATTERNS.display.exec(text)) !== null) {
          matches.push({
            type: 'display',
            start: match.index,
            end: match.index + match[0].length,
            latex: match[1],
            full: match[0]
          });
        }
        
        // Find all inline math matches
        LATEX_PATTERNS.inline.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inline.exec(text)) !== null) {
          // Check if this overlaps with any display math
          let overlaps = false;
          for (const displayMatch of matches) {
            if (displayMatch.type === 'display' && 
                match.index >= displayMatch.start && 
                match.index < displayMatch.end) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            matches.push({
              type: 'inline',
              start: match.index,
              end: match.index + match[0].length,
              latex: match[1],
              full: match[0]
            });
          }
        }
        
        // Check for naive TeX patterns if enabled and no formal LaTeX found
        if (TeXForGmail.naiveTexMode && matches.length === 0) {
          const naiveText = detectNaiveTeX(text);
          if (naiveText) {
            // Process naive TeX patterns
            const naivePatterns = [
              /\b([a-zA-Z])\^(\{[^}]+\}|\w+)/g,  // x^2 or x^{10}
              /\b([a-zA-Z])_(\{[^}]+\}|\w+)/g,   // a_n or a_{10}
              /\be\^\(([^)]+)\)/g,                // e^(i*pi)
            ];
            
            for (const pattern of naivePatterns) {
              pattern.lastIndex = 0;
              while ((match = pattern.exec(text)) !== null) {
                const naiveLatex = match[0];
                matches.push({
                  type: 'inline',
                  start: match.index,
                  end: match.index + match[0].length,
                  latex: naiveLatex,
                  full: naiveLatex,
                  isNaive: true
                });
              }
            }
          }
        }
        
        // Sort matches by position
        matches.sort((a, b) => a.start - b.start);
        
        // Process matches if any found
        if (matches.length > 0) {
          const newNodes = [];
          let lastIndex = 0;
          
          for (const match of matches) {
            // Add text before the match
            if (match.start > lastIndex) {
              newNodes.push(document.createTextNode(text.substring(lastIndex, match.start)));
            }
            
            // Create and add math element based on mode
            let mathElement = null;
            
            // Check if this is a naive TeX match or we should use Simple Math mode
            if (match.isNaive || TeXForGmail.simpleMode) {
              mathElement = renderSimpleMath(match.latex, match.type === 'display');
            } else {
              // Use image-based rendering with server selection
              let imgUrl = null;
              
              // Try primary server
              if (TeXForGmail.serverPreference === 'codecogs' && checkServerHealth('codecogs')) {
                imgUrl = getCodeCogsUrl(match.latex, match.type === 'display');
              } else if (TeXForGmail.serverPreference === 'wordpress' && checkServerHealth('wordpress')) {
                imgUrl = getWordPressUrl(match.latex);
              }
              
              // Fallback logic if primary server fails
              if (!imgUrl) {
                if (TeXForGmail.serverPreference === 'codecogs' && checkServerHealth('wordpress')) {
                  // Fallback to WordPress
                  if (switchServerSafely('wordpress', 'CodeCogs server failed')) {
                    imgUrl = getWordPressUrl(match.latex);
                  }
                } else if (TeXForGmail.serverPreference === 'wordpress' && checkServerHealth('codecogs')) {
                  // Fallback to CodeCogs
                  if (switchServerSafely('codecogs', 'WordPress server recovered')) {
                    imgUrl = getCodeCogsUrl(match.latex, match.type === 'display');
                  }
                }
                
                // If still no URL, both servers failed or switching was blocked
                if (!imgUrl) {
                  // Use Simple Math mode as last resort
                  mathElement = renderSimpleMath(match.latex, match.type === 'display');
                  if (mathElement) {
                    showToast('Using offline math rendering', 'info');
                  }
                }
              }
              
              if (imgUrl && !mathElement) {
                mathElement = createMathWrapper(match.latex, match.type === 'display', imgUrl);
              }
            }
            
            if (mathElement) {
              newNodes.push(mathElement);
            } else {
              // Keep original text if all rendering methods fail
              newNodes.push(document.createTextNode(match.full));
            }
            
            lastIndex = match.end;
          }
          
          // Add remaining text after last match
          if (lastIndex < text.length) {
            newNodes.push(document.createTextNode(text.substring(lastIndex)));
          }
          
          // Mark parent as being processed to prevent double processing
          const parent = textNode.parentNode;
          parent.setAttribute('data-tex-processing-node', 'true');
          
          // Replace the text node with new nodes
          newNodes.forEach(node => {
            parent.insertBefore(node, textNode);
          });
          parent.removeChild(textNode);
          
          // Clear the processing flag on parent node
          parent.removeAttribute('data-tex-processing-node');
          
          hasChanges = true;
        }
      });

      return hasChanges;
    } finally {
      // Always clear processing flag
      composeArea.removeAttribute('data-tex-processing');
    }
  }

  // Task 3: Debounced render function with processing flag management
  function scheduleRender(composeArea) {
    // Check if already processing
    if (composeArea.getAttribute('data-tex-render-scheduled') === 'true') {
      TeXForGmail.log('Render already scheduled for this compose area');
      return;
    }
    
    const existingTimeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Mark as scheduled
    composeArea.setAttribute('data-tex-render-scheduled', 'true');
    
    const newTimeout = setTimeout(() => {
      // Clear scheduled flag
      composeArea.removeAttribute('data-tex-render-scheduled');
      
      // DO NOT update saved content - we want to keep the original clean version
      // The saved content should only be set ONCE when first enabling LaTeX
      
      // Only preserve cursor if compose area has focus
      if (composeArea.contains(document.activeElement) || composeArea === document.activeElement) {
        preserveCursorPosition(composeArea, () => {
          detectAndRenderLatex(composeArea);
        });
      } else {
        // No focus, just render without cursor preservation
        detectAndRenderLatex(composeArea);
      }
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

  // Find compose area associated with a specific button
  function findComposeAreaForButton(button) {
    // Find the compose window that contains this button
    const composeWindow = button.closest('.M9, .AD, .aoI');
    if (composeWindow) {
      // Look for compose area within this specific compose window
      for (const selector of CONFIG.composeSelectors) {
        const composeArea = composeWindow.querySelector(selector);
        if (composeArea) {
          TeXForGmail.log(`Compose area found for button with selector: ${selector}`);
          return composeArea;
        }
      }
    }
    
    TeXForGmail.log('Compose area not found for button');
    return null;
  }
  
  // Find compose area with multiple selector strategies (generic)
  function findComposeArea() {
    // First, check if the currently focused element is a compose area
    const activeElement = document.activeElement;
    if (activeElement) {
      for (const selector of CONFIG.composeSelectors) {
        if (activeElement.matches(selector)) {
          TeXForGmail.log(`Active compose area found with selector: ${selector}`);
          return activeElement;
        }
      }
      
      // Check if the focused element is inside a compose area
      for (const selector of CONFIG.composeSelectors) {
        const parent = activeElement.closest(selector);
        if (parent) {
          TeXForGmail.log(`Parent compose area found with selector: ${selector}`);
          return parent;
        }
      }
    }
    
    // Fallback: find the first compose area on the page
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
    button.className = 'tex-button wG J-Z-I';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Toggle LaTeX rendering');
    button.setAttribute('data-tooltip', 'LaTeX rendering is OFF - Click to toggle ON');
    button.setAttribute('data-toggle-state', 'inactive'); // Initial inactive state
    button.style.cssText = 'display: inline-flex !important; align-items: center; justify-content: center; user-select: none; margin: 0 8px; cursor: pointer; padding: 6px 12px; background: #9e9e9e; color: white; border-radius: 4px; font-weight: bold; font-size: 14px; height: 30px; vertical-align: middle;';
    button.innerHTML = '📐 TeX OFF';
    
    return button;
  }

  // Task 6: Handle button click with mutex pattern to prevent race conditions
  function handleTexButtonClick(button) {
    // Check if button has dataset property for safer processing flag
    if (!button.dataset) {
      button.dataset = {};
    }
    
    // Mutex pattern: Check and set processing flag atomically
    if (button.dataset.processing === 'true') {
      TeXForGmail.log('Already processing, ignoring click');
      return;
    }
    
    // Set processing flag immediately
    button.dataset.processing = 'true';
    button.disabled = true; // Disable button during processing
    
    // Create promise for sequential processing
    const processToggle = new Promise((resolve, reject) => {
      try {
        // Update button state temporarily during processing
        button.textContent = '⏳ Processing...';
        button.style.cursor = 'wait';
        button.style.opacity = '0.6';
        
        // Find the compose area associated with this specific button
        const composeArea = findComposeAreaForButton(button);
        
        if (composeArea) {
          TeXForGmail.log('Toggling LaTeX rendering state');
          
          // Perform toggle operation with proper synchronization
          requestAnimationFrame(() => {
            try {
              const newState = toggleRendering(composeArea);
              
              // Update button visual state to match new toggle state
              button.style.cursor = 'pointer';
              button.style.opacity = '1';
              updateButtonVisualState(button, newState);
              
              resolve(newState);
            } catch (error) {
              TeXForGmail.log('Error during toggle:', error);
              // Restore button to current state
              button.style.cursor = 'pointer';
              button.style.opacity = '1';
              const currentState = composeArea ? getToggleState(composeArea) : true;
              updateButtonVisualState(button, currentState);
              reject(error);
            }
          });
        } else {
          // Reset button state on error
          button.style.cursor = 'pointer';
          button.style.opacity = '1';
          button.textContent = '📐 TeX ON';
          button.style.background = '#4CAF50';
          
          showToast('Could not find compose area. Please try again.', 'error');
          reject(new Error('Compose area not found'));
        }
      } catch (error) {
        TeXForGmail.log('Error in button click handler:', error);
        reject(error);
      }
    });
    
    // Always clean up processing flag in finally block
    processToggle
      .then((newState) => {
        TeXForGmail.log(`Toggle completed, new state: ${newState}`);
      })
      .catch((error) => {
        TeXForGmail.log('Toggle failed:', error);
      })
      .finally(() => {
        // Clear processing flag and re-enable button
        button.dataset.processing = 'false';
        button.disabled = false;
        TeXForGmail.processingStates.delete(button); // Clean up legacy state
      });
  }

  // Function to properly manage auto-render observers with race condition prevention
  function setupAutoRenderObserver(composeArea) {
    // Prevent duplicate observer setup with mutex
    if (!TeXForGmail.observerSetupFlags) {
      TeXForGmail.observerSetupFlags = new WeakMap();
    }
    
    // Check if already setting up observer for this compose area
    if (TeXForGmail.observerSetupFlags.get(composeArea)) {
      TeXForGmail.log('Observer setup already in progress, skipping');
      return;
    }
    
    // Set flag to prevent concurrent setup
    TeXForGmail.observerSetupFlags.set(composeArea, true);
    
    try {
      // Clean up any existing observer for this compose area
      const existingObserver = TeXForGmail.composeObservers.get(composeArea);
      if (existingObserver) {
        existingObserver.disconnect();
        TeXForGmail.composeObservers.delete(composeArea);
      }
    
    // Only set up observer if rendering is enabled
    const isRenderingEnabled = getToggleState(composeArea);
    if (!isRenderingEnabled) {
      TeXForGmail.log('Not setting up observer - toggle is OFF');
      return;
    }
    
    // Create debounced render function once for this observer
    const debouncedRender = debounce(() => {
      // Double-check toggle state (in case it changed)
      const isStillEnabled = getToggleState(composeArea);
      if (isStillEnabled) {
        TeXForGmail.log('Observer triggered, scheduling render');
        scheduleRender(composeArea);
      } else {
        TeXForGmail.log('Observer triggered but toggle is OFF');
      }
    }, CONFIG.debounceDelay);
    
    // Create new observer
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation contains text changes that might be LaTeX
      let hasTextChanges = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check added nodes for text content
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE || 
                (node.nodeType === Node.ELEMENT_NODE && node.textContent)) {
              hasTextChanges = true;
              break;
            }
          }
        } else if (mutation.type === 'characterData') {
          // Direct text edits within existing text nodes
          if (mutation.target.nodeType === Node.TEXT_NODE) {
            hasTextChanges = true;
          }
        }
        if (hasTextChanges) break;
      }
      
      if (hasTextChanges) {
        debouncedRender();
      }
    });
    
    observer.observe(composeArea, {
      childList: true,
      subtree: true,
      characterData: true // Re-enable to catch text edits
    });
    
      // Store observer reference for cleanup
      TeXForGmail.composeObservers.set(composeArea, observer);
      
      // Set up removal detection observer
      setupRemovalObserver(composeArea);
      
      TeXForGmail.log('Auto-render observer set up for compose area');
    } finally {
      // Always clear setup flag
      TeXForGmail.observerSetupFlags.delete(composeArea);
    }
  }
  
  // Add removal observer to detect when compose areas are removed from DOM
  function setupRemovalObserver(composeArea) {
    // Use a separate WeakMap for removal observers
    if (!TeXForGmail.removalObservers) {
      TeXForGmail.removalObservers = new WeakMap();
    }
    
    // Clean up any existing removal observer
    const existingRemovalObserver = TeXForGmail.removalObservers.get(composeArea);
    if (existingRemovalObserver) {
      existingRemovalObserver.disconnect();
    }
    
    // Find the parent container to observe
    const parentContainer = composeArea.closest('.M9, .AD, .aoI') || composeArea.parentElement;
    if (!parentContainer) {
      TeXForGmail.log('Could not find parent container for removal observer');
      return;
    }
    
    // Create removal observer
    const removalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check if our compose area was removed
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === composeArea || (removedNode.nodeType === Node.ELEMENT_NODE && 
                                                removedNode.contains(composeArea))) {
            TeXForGmail.log('Compose area removed from DOM, cleaning up');
            performComprehensiveCleanup(composeArea);
            removalObserver.disconnect();
            TeXForGmail.removalObservers.delete(composeArea);
            return;
          }
        }
      }
      
      // Also check if compose area is no longer in the document
      if (!document.contains(composeArea)) {
        TeXForGmail.log('Compose area no longer in document, cleaning up');
        performComprehensiveCleanup(composeArea);
        removalObserver.disconnect();
        TeXForGmail.removalObservers.delete(composeArea);
      }
    });
    
    removalObserver.observe(parentContainer, {
      childList: true,
      subtree: false // Only watch direct children
    });
    
    TeXForGmail.removalObservers.set(composeArea, removalObserver);
  }
  
  // Comprehensive cleanup function for all resources associated with a compose area
  function performComprehensiveCleanup(composeArea) {
    TeXForGmail.log('Performing comprehensive cleanup for compose area');
    
    // 1. Disconnect and clean up content observer
    const contentObserver = TeXForGmail.composeObservers.get(composeArea);
    if (contentObserver) {
      contentObserver.disconnect();
      TeXForGmail.composeObservers.delete(composeArea);
      TeXForGmail.log('Content observer disconnected and cleaned');
    }
    
    // 2. Disconnect and clean up removal observer
    if (TeXForGmail.removalObservers) {
      const removalObserver = TeXForGmail.removalObservers.get(composeArea);
      if (removalObserver) {
        removalObserver.disconnect();
        TeXForGmail.removalObservers.delete(composeArea);
        TeXForGmail.log('Removal observer disconnected and cleaned');
      }
    }
    
    // 3. Clear any pending render timeouts
    const renderTimeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      TeXForGmail.renderTimeouts.delete(composeArea);
      TeXForGmail.log('Render timeout cleared');
    }
    
    // 4. Clean up toggle state
    if (TeXForGmail.toggleStates.has(composeArea)) {
      TeXForGmail.toggleStates.delete(composeArea);
      TeXForGmail.log('Toggle state cleaned');
    }
    
    // 4b. Clean up saved original content
    if (TeXForGmail.originalContent.has(composeArea)) {
      TeXForGmail.originalContent.delete(composeArea);
      TeXForGmail.log('Original content snapshot cleaned');
    }
    
    // 5. Clean up button and processing states
    const button = getButtonForComposeArea(composeArea);
    if (button) {
      TeXForGmail.processingStates.delete(button);
      // Also remove button from toolbar association
      const parent = composeArea.closest('.M9, .AD');
      if (parent) {
        const toolbar = parent.querySelector('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
        if (toolbar) {
          TeXForGmail.composeButtons.delete(toolbar);
        }
      }
      TeXForGmail.log('Button associations cleaned');
    }
    
    // 6. Force garbage collection hint (browser may ignore)
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {
        // Ignore if gc is not available
      }
    }
  }

  // Cleanup function for compose area observers (now calls comprehensive cleanup)
  function cleanupComposeObserver(composeArea) {
    performComprehensiveCleanup(composeArea);
  }
  
  // Complete cleanup for a toolbar and its button
  function cleanupToolbarButton(toolbar) {
    const button = TeXForGmail.composeButtons.get(toolbar);
    if (button) {
      TeXForGmail.composeButtons.delete(toolbar);
      TeXForGmail.processingStates.delete(button);
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

    // Check if button already exists using WeakMap or DOM check
    if (TeXForGmail.composeButtons.has(toolbar)) {
      TeXForGmail.log('Button already exists for this toolbar (WeakMap)');
      return;
    }
    
    // Additional DOM check for existing tex-button to prevent duplicates
    const existingButton = toolbar.querySelector('.tex-button');
    if (existingButton) {
      TeXForGmail.log('Button already exists for this toolbar (DOM)');
      TeXForGmail.composeButtons.set(toolbar, existingButton);
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

    // Insert button at the end of the toolbar
    toolbar.appendChild(button);
    TeXForGmail.composeButtons.set(toolbar, button);
    
    // Store association between button and compose element for later retrieval
    button.dataset.composeId = composeElement.id || Math.random().toString(36).substr(2, 9);
    
    TeXForGmail.log('Button added to compose toolbar');
    
    // Make sure button is visible
    button.style.display = 'inline-flex !important';
    button.style.visibility = 'visible !important';
    
    // Initialize rendering for this compose area - use the specific compose area for this button
    const composeArea = findComposeAreaForButton(button);
    if (composeArea) {
      // Set initial toggle state to INACTIVE (false) - user must explicitly turn ON
      setToggleState(composeArea, false);
      
      // Update button to show OFF state initially
      updateButtonVisualState(button, false);
      
      // Don't perform initial rendering or set up observer - wait for user to turn ON
      TeXForGmail.log('Button initialized in OFF state - click to enable LaTeX rendering');
    }
  }

  // Check for compose windows
  function checkForComposeWindow() {
    // Look for all compose windows - use Set to avoid duplicates
    const processedToolbars = new Set();
    const composeWindows = document.querySelectorAll('.M9, .AD, .aoI');
    
    composeWindows.forEach(compose => {
      const toolbar = compose.querySelector('.aZ');
      if (toolbar && !processedToolbars.has(toolbar)) {
        processedToolbars.add(toolbar);
        addTexButton(compose);
      }
    });
    
    // Clean up buttons for closed compose windows
    const allToolbars = document.querySelectorAll('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
    allToolbars.forEach(toolbar => {
      if (!toolbar.closest('.M9, .AD, .aoI')) {
        cleanupToolbarButton(toolbar);
      }
    });
  }

  // Set up mutation observer with debouncing
  TeXForGmail.setupObserver = function() {
    const debouncedCheck = debounce(checkForComposeWindow, CONFIG.debounceDelay);
    
    this.observer = new MutationObserver(debouncedCheck);
    this.observer.observe(document.body, CONFIG.observerConfig);
    TeXForGmail.log('Observer watching for compose windows');
    
    // Set up send button interceptor for ensuring rendered math in emails
    this.setupSendInterceptor();
  };
  
  // Fixed send interceptor with all critical bugs resolved
  TeXForGmail.setupSendInterceptor = function() {
    // Track programmatic clicks to prevent infinite recursion
    let programmaticSendInProgress = false;
    
    // Helper function to render and wait for all images to load
    const renderAndWaitForImages = async function(composeArea) {
      return new Promise((resolve, reject) => {
        try {
          // Set toggle state and render
          const originalState = getToggleState(composeArea);
          setToggleState(composeArea, true);
          const hasChanges = detectAndRenderLatex(composeArea);
          
          if (!hasChanges) {
            // No LaTeX to render, restore state if needed
            if (!originalState) {
              setToggleState(composeArea, false);
            }
            resolve({ rendered: false, originalState });
            return;
          }
          
          // Wait for all images to load
          const images = composeArea.querySelectorAll('.tex-math-inline img, .tex-math-display img');
          if (images.length === 0) {
            resolve({ rendered: true, originalState });
            return;
          }
          
          let loadedCount = 0;
          let errorCount = 0;
          const totalImages = images.length;
          
          const checkComplete = () => {
            if (loadedCount + errorCount >= totalImages) {
              if (errorCount > 0) {
                TeXForGmail.log(`Warning: ${errorCount} LaTeX images failed to load`);
              }
              resolve({ rendered: true, originalState });
            }
          };
          
          // Set up load/error handlers
          images.forEach(img => {
            if (img.complete) {
              loadedCount++;
            } else {
              const loadHandler = () => {
                loadedCount++;
                checkComplete();
              };
              const errorHandler = () => {
                errorCount++;
                TeXForGmail.log('LaTeX image failed to load:', img.src);
                checkComplete();
              };
              img.addEventListener('load', loadHandler, { once: true });
              img.addEventListener('error', errorHandler, { once: true });
            }
          });
          
          checkComplete();
          
          // Timeout fallback (5 seconds max for image loading)
          setTimeout(() => {
            TeXForGmail.log('Image loading timeout - proceeding with send');
            resolve({ rendered: true, originalState });
          }, 5000);
        } catch (error) {
          TeXForGmail.log('Error in renderAndWaitForImages:', error);
          reject(error);
        }
      });
    };
    
    // Main interceptor function
    const interceptSend = async function(event) {
      // Skip if this is our programmatic send
      if (programmaticSendInProgress) {
        TeXForGmail.log('Programmatic send in progress, not intercepting');
        return;
      }
      
      const target = event.target;
      const isKeyboard = event.type === 'keydown';
      
      // Detect send action
      let shouldIntercept = false;
      let sendButton = null;
      let composeArea = null;
      
      if (isKeyboard) {
        // Handle Ctrl+Enter or Cmd+Enter
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          const activeElement = document.activeElement;
          // Check if we're in a compose area
          if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            composeArea = activeElement;
            shouldIntercept = true;
            TeXForGmail.log('Keyboard send detected (Ctrl/Cmd+Enter)');
          }
        }
      } else {
        // Handle click events - improved button detection
        const possibleButton = target.closest('div[role="button"], button');
        if (possibleButton) {
          // Check multiple indicators for send button
          const tooltip = possibleButton.getAttribute('data-tooltip') || '';
          const ariaLabel = possibleButton.getAttribute('aria-label') || '';
          const textContent = possibleButton.textContent || '';
          
          // Check if this is a send button
          if (tooltip.includes('Send') || 
              ariaLabel.includes('Send') || 
              (textContent.includes('Send') && possibleButton.getAttribute('role') === 'button')) {
            
            sendButton = possibleButton;
            // Find the compose area relative to the send button
            const composeContainer = sendButton.closest('.M9, .AD, .aoI');
            if (composeContainer) {
              // Find the specific compose area in this container
              composeArea = composeContainer.querySelector(
                '[contenteditable="true"][g_editable="true"], ' +
                '[contenteditable="true"][role="textbox"], ' +
                'div[aria-label*="Message Body"]'
              );
            }
            
            if (composeArea) {
              shouldIntercept = true;
              TeXForGmail.log('Send button click detected');
            }
          }
        }
      }
      
      // Process send interception if needed
      if (shouldIntercept && composeArea) {
        // Check if toggle is OFF and there's LaTeX content
        const currentState = getToggleState(composeArea);
        const hasLatex = /\$[^$\n]+\$|\$\$[^$\n]+\$\$/.test(composeArea.textContent);
        
        if (!currentState && hasLatex) {
          TeXForGmail.log('Intercepting send to render LaTeX (toggle is OFF)');
          
          // Prevent the original send
          event.preventDefault();
          event.stopImmediatePropagation();
          
          // Check if already processing this compose area
          if (!TeXForGmail.sendProcessingStates) {
            TeXForGmail.sendProcessingStates = new WeakMap();
          }
          
          if (TeXForGmail.sendProcessingStates.get(composeArea)) {
            TeXForGmail.log('Already processing send for this compose area');
            return;
          }
          
          // Mark as processing
          TeXForGmail.sendProcessingStates.set(composeArea, true);
          
          try {
            // Render LaTeX and wait for images
            const result = await renderAndWaitForImages(composeArea);
            TeXForGmail.log('LaTeX rendering complete, proceeding with send');
            
            // Now trigger the actual send
            programmaticSendInProgress = true;
            
            if (sendButton) {
              // Use a new click event to trigger send
              const newClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
              });
              sendButton.dispatchEvent(newClickEvent);
            } else if (isKeyboard) {
              // For keyboard shortcut, find and click the send button
              const sendButtons = composeArea.closest('.M9, .AD, .aoI')
                ?.querySelectorAll('[data-tooltip*="Send"], [aria-label*="Send"]');
              if (sendButtons && sendButtons.length > 0) {
                sendButtons[0].click();
              }
            }
            
            // Schedule state restoration after send completes
            setTimeout(() => {
              programmaticSendInProgress = false;
              TeXForGmail.sendProcessingStates.delete(composeArea);
              
              // Restore original state if compose area still exists and was OFF
              if (!result.originalState && document.contains(composeArea)) {
                TeXForGmail.log('Restoring LaTeX source after send');
                setToggleState(composeArea, false);
                restoreLatexSource(composeArea);
              }
            }, 2000);
            
          } catch (error) {
            TeXForGmail.log('Error during send interception:', error);
            // Clean up and allow send to proceed
            programmaticSendInProgress = false;
            TeXForGmail.sendProcessingStates.delete(composeArea);
            
            // Try to send anyway
            if (sendButton) {
              programmaticSendInProgress = true;
              sendButton.click();
              setTimeout(() => {
                programmaticSendInProgress = false;
              }, 500);
            }
          }
        } else if (currentState && hasLatex) {
          TeXForGmail.log('LaTeX already rendered (toggle is ON), allowing normal send');
        }
      }
    };
    
    // Listen for both click and keyboard events
    document.addEventListener('click', interceptSend, true);
    document.addEventListener('keydown', interceptSend, true);
    
    TeXForGmail.log('Send interceptor initialized (click and keyboard)');
  };

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (TeXForGmail.observer) {
      TeXForGmail.observer.disconnect();
      TeXForGmail.log('Main observer disconnected');
    }
    
    // Disconnect all content observers
    if (TeXForGmail.composeObservers) {
      // Note: WeakMap doesn't have iteration, but observers will be GC'd
      TeXForGmail.composeObservers = new WeakMap();
    }
    
    // Disconnect all removal observers
    if (TeXForGmail.removalObservers) {
      TeXForGmail.removalObservers = new WeakMap();
    }
    
    // Clear all timeouts (WeakMap doesn't allow iteration, but timeouts will be cleared by browser)
    TeXForGmail.renderTimeouts = new WeakMap();
    
    // Reset all WeakMaps to ensure clean state
    TeXForGmail.composeButtons = new WeakMap();
    TeXForGmail.processingStates = new WeakMap();
    TeXForGmail.toggleStates = new WeakMap();
  });
  
  // Also clean up on navigation (single-page app navigation)
  window.addEventListener('popstate', () => {
    TeXForGmail.log('Navigation detected, performing cleanup');
    // Find all compose areas and clean them up
    const composeAreas = document.querySelectorAll(CONFIG.composeSelectors.join(','));
    composeAreas.forEach(composeArea => {
      performComprehensiveCleanup(composeArea);
    });
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TeXForGmail.init());
  } else {
    TeXForGmail.init();
  }

  // Expose functions for testing when running in test environment
  // This is only for test pages, not for production use
  if (window.location.pathname.includes('test') || window.location.pathname.includes('Test')) {
    console.log('TeX for Gmail: Test mode detected, exposing functions globally');
    
    // Expose main objects and functions for testing
    window.TeXForGmail = TeXForGmail;
    window.ServerHealth = ServerHealth;
    window.detectAndRenderLatex = detectAndRenderLatex;
    window.switchServerSafely = switchServerSafely;
    window.createMathWrapper = createMathWrapper;
    window.renderSimpleMath = renderSimpleMath;
    window.detectNaiveTeX = detectNaiveTeX;
    window.sanitizeForHTML = sanitizeForHTML;
    window.showToast = showToast;
    
    // Expose configuration for testing
    window.CONFIG = CONFIG;
    
    console.log('TeX for Gmail: Test functions exposed:', {
      TeXForGmail: !!window.TeXForGmail,
      ServerHealth: !!window.ServerHealth,
      detectAndRenderLatex: !!window.detectAndRenderLatex,
      switchServerSafely: !!window.switchServerSafely,
      createMathWrapper: !!window.createMathWrapper
    });
  }

})();