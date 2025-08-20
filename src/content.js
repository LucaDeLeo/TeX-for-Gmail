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
      inline: 110,  // Inline equations: better text sizing
      display: 300  // Display equations: higher fidelity
    },
    size: {
      inline: '\\normalsize',
      display: '\\large'
    },
    maxApiCallsPerMinute: 60, // Rate limiting
    maxLatexLength: 1000 // Maximum LaTeX string length
  };

  // Storage Service with quota handling and fallback
  class StorageService {
    constructor() {
      this.syncQuotaExceeded = false;
      this.performanceMetrics = new Map();
      
      // Validation rules with defaults
      this.validationRules = {
        sendBehavior: { type: 'enum', values: ['always', 'never', 'ask'], default: 'ask' },
        renderServer: { type: 'enum', values: ['codecogs', 'wordpress'], default: 'codecogs' },
        dpiInline: { type: 'number', min: 100, max: 400, default: 110 },
        dpiDisplay: { type: 'number', min: 100, max: 400, default: 300 },
        simpleMathFontOutgoing: { type: 'font', maxLength: 100, default: 'serif' },
        simpleMathFontIncoming: { type: 'font', maxLength: 100, default: 'serif' },
        showComposeButton: { type: 'boolean', default: true },
        showReadButton: { type: 'boolean', default: true },
        enableKeyboardShortcuts: { type: 'boolean', default: true },
        rememberSendChoice: { type: 'boolean', default: false },
        lastSendChoice: { type: 'enum', values: ['render', 'send_without', null], default: null },
        serverFallback: { type: 'boolean', default: true },
        enableNaiveTeX: { type: 'boolean', default: false },
        enableSimpleMath: { type: 'boolean', default: false },
        maxApiCallsPerMinute: { type: 'number', min: 1, max: 1000, default: 60 },
        debounceDelay: { type: 'number', min: 100, max: 5000, default: 500 },
        debugMode: { type: 'boolean', default: false }
      };
      
      // Rate limiting for storage operations
      this.lastStorageOperation = 0;
      this.minOperationInterval = 100; // Minimum 100ms between operations
      
      // Allowed font names for validation
      this.allowedFonts = [
        'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
        'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
        'Georgia', 'Times New Roman', 'Times', 'Arial', 'Helvetica',
        'Verdana', 'Trebuchet MS', 'Gill Sans', 'Noto Sans', 'Roboto',
        'Ubuntu', 'Courier New', 'Courier', 'Consolas', 'Monaco', 'Menlo'
      ];
    }
    
    // Sanitize font name to prevent CSS injection
    sanitizeFontName(font) {
      if (!font) return 'serif';
      
      // Remove any potential CSS injection vectors
      let sanitized = font.toString().replace(/[^a-zA-Z0-9\s\-]/g, '');
      
      // Check if it's in the allowed list (case-insensitive)
      const fontLower = sanitized.toLowerCase();
      const isAllowed = this.allowedFonts.some(allowed => 
        allowed.toLowerCase() === fontLower
      );
      
      if (!isAllowed) {
        console.warn(`Invalid font name "${font}", using default "serif"`);
        return 'serif';
      }
      
      return sanitized;
    }
    
    // Validate a single value based on rules
    validateValue(key, value, rule) {
      if (!rule) return { valid: true, value };
      
      // Handle null/undefined values
      if (value === null || value === undefined) {
        // Use default value if available
        if (rule.default !== undefined) {
          return { valid: true, value: rule.default };
        }
        // For required fields, return error
        if (rule.required) {
          return { valid: false, error: `${key} is required`, value: rule.default };
        }
        // Otherwise, use default or null
        return { valid: true, value: rule.default || null };
      }
      
      switch (rule.type) {
        case 'boolean':
          // Handle string boolean values
          if (typeof value === 'string') {
            value = value.toLowerCase() === 'true' || value === '1' || value === 'yes';
          }
          return { 
            valid: true,
            value: Boolean(value)
          };
          
        case 'number':
          const num = Number(value);
          if (isNaN(num) || !isFinite(num)) {
            console.warn(`${key}: Invalid number "${value}", using default ${rule.default}`);
            return { 
              valid: true, 
              value: rule.default || rule.min || 0
            };
          }
          // Clamp to min/max automatically
          let clampedValue = num;
          if (rule.min !== undefined && num < rule.min) {
            console.warn(`${key}: Value ${num} clamped to minimum ${rule.min}`);
            clampedValue = rule.min;
          }
          if (rule.max !== undefined && num > rule.max) {
            console.warn(`${key}: Value ${num} clamped to maximum ${rule.max}`);
            clampedValue = rule.max;
          }
          // Round for integer values like DPI
          return { valid: true, value: Math.round(clampedValue) };
          
        case 'enum':
          // Handle case-insensitive matching for strings
          if (value === null && rule.values.includes(null)) {
            return { valid: true, value: null };
          }
          
          const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
          const validValue = rule.values.find(v => 
            (typeof v === 'string' ? v.toLowerCase() : v) === normalizedValue
          );
          
          if (validValue === undefined) {
            // Use default or first valid value
            const defaultValue = rule.default !== undefined ? rule.default : rule.values[0];
            console.warn(`${key}: Invalid value "${value}", using default "${defaultValue}"`);
            return { 
              valid: true, 
              value: defaultValue
            };
          }
          return { valid: true, value: validValue };
          
        case 'font':
          const sanitized = this.sanitizeFontName(value);
          // Ensure it's not empty after sanitization
          if (!sanitized || sanitized.length === 0) {
            return { valid: true, value: rule.default || 'serif' };
          }
          if (rule.maxLength && sanitized.length > rule.maxLength) {
            return { 
              valid: true, 
              value: sanitized.substring(0, rule.maxLength)
            };
          }
          return { valid: true, value: sanitized };
          
        default:
          console.warn(`Unknown validation type: ${rule.type}`);
          return { valid: true, value };
      }
    }
    
    // Validate and sanitize all data before storage
    validateAndSanitize(data) {
      const validated = {};
      const errors = [];
      
      for (const [key, value] of Object.entries(data)) {
        const rule = this.validationRules[key];
        
        if (rule) {
          const result = this.validateValue(key, value, rule);
          
          if (!result.valid) {
            errors.push(result.error || `Invalid value for ${key}`);
            // Use corrected value if available, otherwise skip
            if (result.value !== undefined) {
              validated[key] = result.value;
            }
          } else {
            validated[key] = result.value;
          }
        } else {
          // Unknown key - log warning but allow it
          console.warn(`Unknown setting key: ${key}`);
          validated[key] = value;
        }
      }
      
      if (errors.length > 0) {
        console.warn('Validation warnings:', errors);
      }
      
      return { data: validated, errors };
    }

    // Measure and log performance of storage operations
    async measureOperation(operationName, operation) {
      const startTime = performance.now();
      const startMark = `storage-${operationName}-start-${Date.now()}`;
      const endMark = `storage-${operationName}-end-${Date.now()}`;
      
      performance.mark(startMark);
      
      try {
        const result = await operation();
        const endTime = performance.now();
        performance.mark(endMark);
        
        const duration = endTime - startTime;
        performance.measure(`storage-${operationName}`, startMark, endMark);
        
        // Store metrics for monitoring
        if (!this.performanceMetrics.has(operationName)) {
          this.performanceMetrics.set(operationName, []);
        }
        this.performanceMetrics.get(operationName).push(duration);
        
        // Log if operation exceeds 100ms threshold
        if (duration > 100) {
          console.warn(`Storage operation "${operationName}" took ${duration.toFixed(2)}ms (exceeds 100ms threshold)`);
        }
        
        return result;
      } catch (error) {
        performance.mark(endMark);
        performance.measure(`storage-${operationName}-failed`, startMark, endMark);
        throw error;
      }
    }

    // Set data with validation and automatic fallback
    async set(data) {
      // Rate limiting check
      const now = Date.now();
      const timeSinceLastOp = now - this.lastStorageOperation;
      if (timeSinceLastOp < this.minOperationInterval) {
        const waitTime = this.minOperationInterval - timeSinceLastOp;
        console.warn(`Rate limiting: waiting ${waitTime}ms before storage operation`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.lastStorageOperation = Date.now();
      
      return this.measureOperation('set', async () => {
        // Validate and sanitize data before storage
        const { data: validatedData, errors } = this.validateAndSanitize(data);
        
        if (errors.length > 0) {
          console.warn('Data validation warnings during storage:', errors);
        }
        
        // Ensure we're not storing excessive data
        const dataSize = JSON.stringify(validatedData).length;
        if (dataSize > 8192) { // Chrome sync storage has 8KB limit per item
          console.warn(`Large data size (${dataSize} bytes), may exceed storage limits`);
        }
        
        try {
          if (!this.syncQuotaExceeded) {
            await chrome.storage.sync.set(validatedData);
            return { storage: 'sync', success: true, validated: true };
          } else {
            throw new Error('Sync quota exceeded, using local storage');
          }
        } catch (error) {
          // Check if it's a quota error
          if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
            this.syncQuotaExceeded = true;
            console.warn('Chrome sync storage quota exceeded, falling back to local storage');
          }
          
          // Fallback to local storage
          try {
            await chrome.storage.local.set(validatedData);
            return { storage: 'local', success: true, fallback: true, validated: true };
          } catch (localError) {
            console.error('Failed to save to both sync and local storage:', localError);
            throw localError;
          }
        }
      });
    }

    // Get data with automatic fallback
    async get(keys) {
      return this.measureOperation('get', async () => {
        try {
          // Try sync storage first
          const syncData = await chrome.storage.sync.get(keys);
          
          // If we have data, return it
          if (syncData && Object.keys(syncData).length > 0) {
            return syncData;
          }
          
          // Otherwise try local storage
          const localData = await chrome.storage.local.get(keys);
          return localData;
        } catch (error) {
          console.error('Failed to retrieve storage data:', error);
          // Return default values if keys is an object with defaults
          if (typeof keys === 'object' && !Array.isArray(keys)) {
            return keys;
          }
          return {};
        }
      });
    }

    // Clear specific keys from both storages
    async remove(keys) {
      return this.measureOperation('remove', async () => {
        const results = await Promise.allSettled([
          chrome.storage.sync.remove(keys),
          chrome.storage.local.remove(keys)
        ]);
        
        return {
          sync: results[0].status === 'fulfilled',
          local: results[1].status === 'fulfilled'
        };
      });
    }

    // Get performance report
    getPerformanceReport() {
      const report = {};
      for (const [operation, times] of this.performanceMetrics) {
        const sorted = times.sort((a, b) => a - b);
        report[operation] = {
          count: times.length,
          min: Math.min(...times).toFixed(2),
          max: Math.max(...times).toFixed(2),
          avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
          median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
          exceeds100ms: times.filter(t => t > 100).length
        };
      }
      return report;
    }
  }

  // Create global storage service instance
  const storageService = new StorageService();

  // Main namespace object for state management
  const TeXForGmail = {
    observer: null,
    composeButtons: new WeakMap(),
    readButtons: new WeakMap(), // Track buttons in read mode
    processingStates: new WeakMap(),
    composeObservers: new WeakMap(), // Track observers per compose area
    
    // Template shortcuts for LaTeX commands
    TEX_TEMPLATES: {
      'F': { template: '\\frac{|}{}', name: 'Fraction' },
      'S': { template: '\\sqrt{|}', name: 'Square root' },
      'I': { template: '\\int_{|}^{}', name: 'Integral' },
      'M': { template: '\\begin{matrix}|\\end{matrix}', name: 'Matrix' },
      'P': { template: '\\prod_{|}^{}', name: 'Product' },
      'U': { template: '\\sum_{|}^{}', name: 'Sum' },
      'L': { template: '\\lim_{|}', name: 'Limit' },
      'V': { template: '\\vec{|}', name: 'Vector' }
    },
    renderTimeouts: new WeakMap(), // Track render timeouts per compose area
    toggleStates: new WeakMap(), // Track toggle state per compose area
    originalContent: new WeakMap(), // Store original content before rendering
    removalObservers: new WeakMap(), // Track removal observers for cleanup
    sendProcessingStates: new WeakMap(), // Track send processing states
    observerSetupFlags: new WeakMap(), // Prevent duplicate observer setup
    apiCallTimes: [], // Track API call timestamps for rate limiting
    debugMode: false, // Set to true for verbose logging
    simpleMode: false, // Simple Math mode flag
    naiveTexMode: false, // Naive TeX detection mode flag
    serverPreference: 'codecogs', // Current server preference
    serverSwitchMutex: false, // Mutex to prevent concurrent server switches
    serverSwitchTimestamp: 0, // Track last switch time
    settings: null, // Cached settings from chrome.storage
    settingsLoadPromise: null, // Promise for settings loading
    init() {
      console.log('🚀 TeX for Gmail: Extension initializing...');
      this.log('Extension initialized');
      
      // Load settings from chrome.storage
      this.loadSettings();
      
      // Load server preference from sessionStorage (for backward compatibility)
      try {
        const savedPreference = sessionStorage.getItem('tex-gmail-server-preference');
        if (savedPreference && ['codecogs', 'wordpress'].includes(savedPreference)) {
          this.serverPreference = savedPreference;
          this.log('Loaded server preference:', savedPreference);
          // Migrate to chrome.storage
          if (this.settings) {
            this.settings.renderServer = savedPreference;
            storageService.set({ renderServer: savedPreference });
            sessionStorage.removeItem('tex-gmail-server-preference');
          }
        }
      } catch (e) {
        // Silently fail if sessionStorage is not available
        this.log('Could not load server preference from sessionStorage');
      }
      
      this.setupObserver();
      // Check for existing compose windows immediately
      checkForComposeWindow();
      
      // Set up global keyboard event handler
      this.setupKeyboardHandler();
    },
    // Styles and helpers for non-destructive read-mode rendering
    ensureOverlayStyles() {
      if (document.getElementById('tex-read-overlay-styles')) return;
      const style = document.createElement('style');
      style.id = 'tex-read-overlay-styles';
      style.textContent = `
        .tex-read-overlay { 
          position: absolute; 
          inset: 0; 
          width: 100%; 
          pointer-events: none; 
          background: transparent !important; 
          z-index: 1;
        }
        .tex-read-overlay-content { 
          position: relative;
          pointer-events: none;
        }
        /* Hide original text but preserve layout */
        .tex-read-overlay-content > * { 
          visibility: hidden !important; 
        }
        /* Show only rendered math elements */
        .tex-read-overlay .tex-math-inline,
        .tex-read-overlay .tex-math-display,
        .tex-read-overlay .tex-math-inline *,
        .tex-read-overlay .tex-math-display * { 
          visibility: visible !important; 
          pointer-events: auto;
        }
      `;
      document.head.appendChild(style);
    },
    getReadOverlay(emailContainer) {
      // Make container positioning context
      const computed = window.getComputedStyle(emailContainer);
      if (!['relative','absolute','fixed','sticky'].includes(computed.position)) {
        emailContainer.style.position = 'relative';
      }
      // Find or create overlay
      let overlay = emailContainer.querySelector('.tex-read-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tex-read-overlay';
        const content = document.createElement('div');
        content.className = 'tex-read-overlay-content';
        overlay.appendChild(content);
        emailContainer.appendChild(overlay);
      }
      return overlay;
    },
    removeReadOverlay(emailContainer) {
      const overlay = emailContainer.querySelector('.tex-read-overlay');
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
    async renderReadOverlay(emailContainer) {
      try {
        this.ensureOverlayStyles();
        const overlay = this.getReadOverlay(emailContainer);
        const content = overlay.querySelector('.tex-read-overlay-content');
        // Copy current email HTML into overlay content (children only)
        content.innerHTML = emailContainer.innerHTML;
        // Run one-time render on overlay copy
        await detectAndRenderLatex(content, { oneTimeRender: true });
        return true;
      } catch (e) {
        this.log('Error rendering read overlay:', e);
        return false;
      }
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
    },
    // Load settings from chrome.storage
    async loadSettings() {
      const defaultSettings = {
        sendBehavior: 'ask',
        renderServer: 'codecogs',
        dpiInline: 110,
        dpiDisplay: 300,
        simpleMathFontOutgoing: 'serif',
        simpleMathFontIncoming: 'serif',
        showComposeButton: true,
        showReadButton: true,
        enableKeyboardShortcuts: true,
        enableNaiveTeX: false,
        enableSimpleMath: true,
        rememberSendChoice: false,
        lastSendChoice: null
      };
      
      if (!this.settingsLoadPromise) {
        this.settingsLoadPromise = new Promise(async (resolve) => {
          const settings = await storageService.get(defaultSettings);
          this.settings = settings;
          // Update CONFIG with settings
          if (settings.dpiInline) CONFIG.dpi.inline = settings.dpiInline;
          if (settings.dpiDisplay) CONFIG.dpi.display = settings.dpiDisplay;
          if (settings.renderServer) this.serverPreference = settings.renderServer;
          
          // Set naive TeX mode based on setting
          if (settings.enableNaiveTeX) {
            this.naiveTexMode = true;
            this.log('Naive TeX mode enabled from settings');
          }
          
          this.log('Settings loaded:', settings);
          resolve(settings);
        });
      }
      
      return this.settingsLoadPromise;
    },
    // Get current settings (with fallback)
    async getSettings() {
      if (!this.settings) {
        await this.loadSettings();
      }
      return this.settings;
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
                             !isCurrency(currentTextContent)) ||
                            /\\\[([^\\]*(?:\\.[^\\]*)*?)\\\]/.test(currentTextContent) ||
                            /\\\(([^\\]*(?:\\.[^\\]*)*?)\\\)/.test(currentTextContent);
      
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
  // Pattern Precedence (Story 3.2):
  // 1. Display patterns ($$...$$ and \[...\]) are processed first
  // 2. Inline patterns ($...$ and \(...\)) are processed second
  // 3. Overlapping patterns: Display takes priority over inline
  // 4. Escaped delimiters (\$, \(, \[) are handled as literal text
  const LATEX_PATTERNS = {
    // Display math: $$...$$ (must be on same line, no nested $$)
    display: /\$\$([^\$\n]+?)\$\$/g,
    // Display math: \[...\] (bracket delimiters) - Story 3.2
    displayBracket: /\\\[([^\\]*(?:\\.[^\\]*)*?)\\\]/g,
    // Inline math: $...$ (must be on same line, no nested $)
    // Removed the (?!\d) negative lookahead to allow math with numbers like $1 + 1 = 2$
    // Currency filtering is handled by the isCurrency() function instead
    inline: /(?<!\$)\$([^\$\n]+?)\$/g,
    // Inline math: \(...\) (parenthesis delimiters) - Story 3.2
    inlineParenthesis: /\\\(([^\\]*(?:\\.[^\\]*)*?)\\\)/g,
    // Pattern to detect escaped dollar signs
    escaped: /\\\$/g
  };

  // LaTeX validation to prevent injection attacks
  function isValidLatex(latex) {
    // Check length first (prevent regex DoS)
    if (latex.length >= CONFIG.maxLatexLength) {
      return false;
    }
    
    // Task 4 (Story 3.2): Check for trailing spaces
    // Don't render formulas ending with space
    if (latex.trim() !== latex) {
      return false;
    }
    
    // Basic validation - no script tags or suspicious patterns
    const dangerous = /<script|javascript:|on\w+=/i;
    return !dangerous.test(latex);
  }

  // Currency patterns compiled once for performance
  // Task 5 (Story 3.2): Enhanced currency pattern detection
  const CURRENCY_PATTERNS = [
    /\$\d+(?:[,.\d]*)?(?:\s+(?:and|to|-|\+|or)\s+\$\d+(?:[,.\d]*)?)?/,
    /\$\d+(?:[,.\d]*)?\/(?:hr|hour|day|week|month|year)/i,
    /(?:USD|EUR|GBP|CAD|AUD|JPY|CNY|INR)\s*\$?\d+/i,
    /\$\d+\.\d{2}(?:\s|$)/, // Prices like $9.99
    /\$\d{1,3}(?:,\d{3})+/, // Formatted amounts like $1,000
    /\$\d+\.?\d*(?:\s*(?:billion|million|thousand|hundred|k|K|M|B))?/i, // $5M, $10k
    /\$\d+(?:\.\d{1,2})?(?:\s*[-–]\s*\$?\d+(?:\.\d{1,2})?)?/, // Price ranges: $10-$20
    /(?:€|£|¥|₹|¢)\d+/, // Other currency symbols
    /\$\d+(?:\.\d{2})?\s*(?:each|per|\/)/i, // $5 each, $10 per
    /\$\d+\s*x\s*\d+/, // $5 x 3 (quantity pricing)
    /\$\d+(?:\.\d{2})?\s+(?:off|discount|savings?|rebate)/i // $10 off, $5 discount
  ];
  
  // Currency detection helper - Enhanced with more patterns
  function isCurrency(text) {
    // Quick check for dollar sign followed by digit
    if (!/\$\d/.test(text)) {
      return false;
    }
    
    // Task 5 (Story 3.2): Additional context checks
    // Allow legitimate math like $1 + 1 = 2$ by checking for math operators
    const hasMathOperators = /[\+\-\*\/\=\^_\\]/.test(text);
    const hasOnlyPricePattern = /^\$\d+(?:\.\d{2})?$/.test(text.trim());
    
    // If it's just a price pattern without math operators, it's currency
    if (hasOnlyPricePattern) {
      return true;
    }
    
    // If it has math operators, less likely to be currency
    if (hasMathOperators) {
      // But still check for obvious currency patterns
      return CURRENCY_PATTERNS.slice(0, 6).some(pattern => pattern.test(text));
    }
    
    // Check against all currency patterns
    return CURRENCY_PATTERNS.some(pattern => pattern.test(text));
  }

  // Task 2 (Story 3.2): Abbreviation expansion system
  // Expands convenient abbreviations to full LaTeX commands
  // Examples: \bR → \mathbb R, \cH → \mathcal H, \wA → \widetilde A
  // Applied before sending to rendering servers
  
  // Pre-compiled regex patterns for performance
  const ABBREVIATION_PATTERNS = [
    { regex: /\\b([A-Za-z])/g, replacement: '\\mathbb $1' },      // Blackboard bold: \bR → \mathbb R
    { regex: /\\bf([A-Za-z])/g, replacement: '\\mathbf $1' },     // Bold: \bfA → \mathbf A
    { regex: /\\d([A-Za-z])/g, replacement: '\\mathbf $1' },      // Bold (alternative): \dA → \mathbf A
    { regex: /\\c([A-Za-z])/g, replacement: '\\mathcal $1' },     // Calligraphic: \cA → \mathcal A
    { regex: /\\f([A-Za-z])/g, replacement: '\\mathfrak $1' },    // Fraktur: \fA → \mathfrak A
    { regex: /\\w([A-Za-z])/g, replacement: '\\widetilde $1' },   // Wide tilde: \wA → \widetilde A
    { regex: /\\o([A-Za-z])/g, replacement: '\\overline $1' },    // Overline: \oA → \overline A
    { regex: /\\u([A-Za-z])/g, replacement: '\\underline $1' }    // Underline: \uA → \underline A
  ];
  
  function expandAbbreviations(latex) {
    // Apply each pre-compiled abbreviation pattern
    let expanded = latex;
    for (const pattern of ABBREVIATION_PATTERNS) {
      expanded = expanded.replace(pattern.regex, pattern.replacement);
    }
    
    return expanded;
  }

  // Task 3 (Story 3.2): Theorem environment support
  // Supports LaTeX theorem-like environments with optional color themes
  // Syntax: \begin{environment}[color]...\end{environment}
  // Environments: theorem, lemma, proposition, corollary, definition
  // Colors: red, blue, green, gray, yellow (default)
  function detectTheoremEnvironments(text) {
    // Environment types that are supported
    const ENVIRONMENTS = ['theorem', 'lemma', 'proposition', 'corollary', 'definition'];
    
    // Build regex pattern for all environments
    const envPattern = ENVIRONMENTS.join('|');
    const regex = new RegExp(
      `\\\\begin\\{(${envPattern})\\}(?:\\[([^\\]]+)\\])?([\\s\\S]*?)\\\\end\\{\\1\\}`,
      'g'
    );
    
    // Check if text contains theorem environments
    return regex.test(text);
  }
  
  function createTheoremWrapper(envType, colorArg, content) {
    // Validate content length to prevent DoS
    if (!content || content.length > CONFIG.maxLatexLength) {
      TeXForGmail.log('Theorem content too long or empty, skipping');
      return null;
    }
    
    // Define color mapping for theorem environments
    const THEOREM_COLORS = {
      red: '#ffe6e6',
      blue: '#e6f3ff',
      green: '#e6ffe6',
      gray: '#f0f0f0',
      yellow: '#fff9e6'  // default
    };
    
    // Get color or use default
    const color = THEOREM_COLORS[colorArg] || THEOREM_COLORS.yellow;
    
    // Map colors to appropriate border colors for better visual hierarchy
    const BORDER_COLORS = {
      '#ffe6e6': '#ff9999',  // red
      '#e6f3ff': '#99ccff',  // blue
      '#e6ffe6': '#99ff99',  // green
      '#f0f0f0': '#999999',  // gray
      '#fff9e6': '#f0b429'   // yellow
    };
    
    // Capitalize environment type for display
    const envTitle = envType.charAt(0).toUpperCase() + envType.slice(1);
    
    // Create HTML wrapper for theorem using safe DOM methods
    const wrapper = document.createElement('div');
    wrapper.className = 'tex-theorem-env';
    wrapper.setAttribute('data-theorem-type', envType);
    wrapper.style.cssText = `
      background-color: ${color};
      border-left: 4px solid ${BORDER_COLORS[color] || '#999'};
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
    `;
    
    // Add title
    const title = document.createElement('strong');
    title.textContent = `${envTitle}: `;
    title.style.cssText = 'display: block; margin-bottom: 5px;';
    
    // Add content (will be processed for LaTeX later)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'tex-theorem-content';
    contentDiv.textContent = content.trim();
    
    wrapper.appendChild(title);
    wrapper.appendChild(contentDiv);
    
    return wrapper;
  }

  // Task 2: CodeCogs API Integration with validation and rate limiting
  function getCodeCogsUrl(latex, isDisplay) {
    // Expand abbreviations before processing
    latex = expandAbbreviations(latex);
    
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
    // Fix: Remove invalid \inline prefix - use empty string or \textstyle for inline
    const displayPrefix = isDisplay ? '\\displaystyle' : '';
    return `https://latex.codecogs.com/png.image?\\dpi{${dpi}}${displayPrefix}%20${encoded}`;
  }

  // WordPress Server as Fallback (Task 6)
  function getWordPressUrl(latex) {
    // Expand abbreviations before processing
    latex = expandAbbreviations(latex);
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
    // Expand abbreviations before processing
    latex = expandAbbreviations(latex);
    
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
      
      // Add proper styling for inline vs display differentiation
      if (isDisplay) {
        wrapper.style.display = 'block';
        wrapper.style.textAlign = 'center';
        wrapper.style.margin = '1em 0';
      } else {
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'middle';
      }
      
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
      if (!isDisplay) {
        container.style.verticalAlign = 'middle';
      }
      
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
      /\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|Alpha|Beta|Gamma|Delta|Epsilon|Theta|Lambda|Mu|Pi|Sigma|Omega)/g,
      /\b\d+\/\d+\b/g,                    // Fractions like 1/2, 3/4
      /\b([a-zA-Z])_\d+\^\d+/g            // Combined subscript and superscript like x_1^2
    ];
    
    // Check if text contains potential naive TeX (avoid false positives with currency)
    const currencyPattern = /\$[\d,]+\.?\d*/g;
    const hasCurrency = currencyPattern.test(text);
    
    // Also avoid URLs and file paths
    const urlPattern = /https?:\/\/|www\.|\/\w+\.\w+/gi;
    const hasUrl = urlPattern.test(text);
    
    if (hasCurrency || hasUrl) {
      // Skip if text primarily contains currency or URLs
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
    
    // Add proper styling for inline vs display differentiation
    if (isDisplay) {
      wrapper.style.display = 'block';
      wrapper.style.textAlign = 'center';
      wrapper.style.margin = '1em 0';
    } else {
      wrapper.style.display = 'inline-block';
      wrapper.style.verticalAlign = 'middle';
    }
    
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
    
    // Consistent styling with proper alignment for inline vs display
    if (isDisplay) {
      img.style.display = 'inline-block';
      img.style.maxWidth = '100%';
    } else {
      img.style.verticalAlign = 'middle';
      img.style.display = 'inline';
    }
    img.style.cursor = 'pointer';
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Click to edit LaTeX source');
    
    // Store original source with delimiters for click-to-edit
    img.setAttribute('data-original-source', isDisplay ? `$$${latex}$$` : `$${latex}$`);
    
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
    
    // Add click-to-edit handler
    img.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Don't trigger during drag operations
      if (e.buttons !== 0 && e.buttons !== 1) return;
      
      TeXForGmail.handleImageClick(this);
    });
    
    wrapper.appendChild(img);
    return wrapper;
  }

  // Handle click on rendered LaTeX image to restore source text
  TeXForGmail.handleImageClick = function(img) {
    const wrapper = img.parentElement;
    const sourceText = img.getAttribute('data-original-source');
    
    if (!sourceText) {
      TeXForGmail.log('Click-to-edit: No source text found');
      return;
    }
    
    // Create text node with original source
    const textNode = document.createTextNode(sourceText);
    wrapper.parentNode.replaceChild(textNode, wrapper);
    
    // Position cursor after opening delimiter
    const range = document.createRange();
    const delimLength = sourceText.startsWith('$$') ? 2 : 1;
    range.setStart(textNode, delimLength);
    range.setEnd(textNode, delimLength);
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Focus the compose area
    const composeArea = textNode.parentElement;
    if (composeArea && composeArea.focus) {
      composeArea.focus();
    }
    
    TeXForGmail.log('Click-to-edit: Restored source text', sourceText);
  };
  
  // Insert LaTeX template at cursor position
  TeXForGmail.insertTexTemplate = function(template) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Check if we're in a Gmail compose area
    const composeArea = this.getActiveTarget();
    if (!composeArea) {
      TeXForGmail.log('Template insertion: Not in compose area');
      return false;
    }
    
    // Replace | with empty string for insertion, remember position
    const cursorPos = template.indexOf('|');
    const cleanTemplate = template.replace(/\|/g, '');
    
    // Insert the template text
    document.execCommand('insertText', false, cleanTemplate);
    
    // Position cursor at the | marker position if present
    if (cursorPos >= 0) {
      // Get the updated selection after insertion
      const newSelection = window.getSelection();
      if (newSelection.rangeCount) {
        const newRange = newSelection.getRangeAt(0);
        const textNode = newRange.startContainer;
        
        if (textNode.nodeType === Node.TEXT_NODE) {
          // Calculate the new cursor position
          const startOffset = newRange.startOffset - cleanTemplate.length + cursorPos;
          
          if (startOffset >= 0 && startOffset <= textNode.textContent.length) {
            const cursorRange = document.createRange();
            cursorRange.setStart(textNode, startOffset);
            cursorRange.setEnd(textNode, startOffset);
            
            newSelection.removeAllRanges();
            newSelection.addRange(cursorRange);
          }
        }
      }
    }
    
    return true;
  };
  
  // Navigate between template placeholders
  TeXForGmail.navigateTemplate = function(direction) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    if (container.nodeType !== Node.TEXT_NODE) return;
    
    const text = container.textContent;
    const currentPos = range.startOffset;
    
    // Find {} pairs as placeholders
    const placeholders = [];
    let braceDepth = 0;
    let placeholderStart = -1;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (braceDepth === 0) placeholderStart = i;
        braceDepth++;
      } else if (text[i] === '}') {
        braceDepth--;
        if (braceDepth === 0 && placeholderStart >= 0) {
          // Check if placeholder is empty
          if (i - placeholderStart === 1) {
            placeholders.push({ start: placeholderStart + 1, end: i });
          }
          placeholderStart = -1;
        }
      }
    }
    
    if (placeholders.length === 0) return;
    
    let targetPlaceholder;
    if (direction === 'next') {
      targetPlaceholder = placeholders.find(p => p.start > currentPos);
      if (!targetPlaceholder) targetPlaceholder = placeholders[0]; // Wrap around
    } else {
      targetPlaceholder = placeholders.reverse().find(p => p.start < currentPos);
      if (!targetPlaceholder) targetPlaceholder = placeholders[placeholders.length - 1]; // Wrap around
    }
    
    if (targetPlaceholder) {
      const newRange = document.createRange();
      newRange.setStart(container, targetPlaceholder.start);
      newRange.setEnd(container, targetPlaceholder.end);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  };

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
  function detectAndRenderLatex(composeArea, options = {}) {
    if (!composeArea) return false;
    
    const { oneTimeRender = false, isReadMode = false } = options;
    
    // Skip concurrent processing check for read mode
    if (!isReadMode && composeArea.getAttribute('data-tex-processing') === 'true') {
      TeXForGmail.log('Already processing this compose area, skipping');
      return false;
    }
    
    // Task 4 (Story 1.3): Check toggle state before rendering (skip for one-time renders)
    const isRenderingEnabled = oneTimeRender ? 'api' : getToggleState(composeArea);
    if (!isRenderingEnabled) {
      TeXForGmail.log('Rendering disabled by toggle, skipping');
      return false;
    }
    
    // Set processing flag
    composeArea.setAttribute('data-tex-processing', 'true');
    
    // Store original content for read mode (to allow restoration)
    if (isReadMode && !TeXForGmail.originalContent.has(composeArea)) {
      TeXForGmail.originalContent.set(composeArea, composeArea.innerHTML);
      TeXForGmail.log('Stored original content for read mode');
    }
    
    try {
      const textNodes = findTextNodes(composeArea);
      let hasChanges = false;

      textNodes.forEach(textNode => {
        // Skip if parent was marked as processed during this render cycle
        if (textNode.parentNode?.getAttribute('data-tex-processing-node') === 'true') {
          return;
        }
        
        let text = textNode.textContent;
        
        // Skip if it looks like currency
        if (isCurrency(text)) {
          return;
        }
        
        // Skip if this is alt text from existing math image
        if (text.match(/^\$+.*\$+$/) && textNode.parentNode?.querySelector('img[alt*="$"]')) {
          return;
        }
        
        // Task 7 (Story 3.2): Handle escaped dollar signs by masking them
        // This preserves literal \$ while allowing other LaTeX patterns to work
        const ESCAPED_DOLLAR_PLACEHOLDER = '__ESCAPED_DOLLAR_SIGN__';
        const hasEscapedDollar = text.includes('\\$');
        if (hasEscapedDollar) {
          // Temporarily replace escaped dollar signs with placeholder
          text = text.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);
        }

        // Check for theorem environments first
        if (detectTheoremEnvironments(text)) {
          // Environment types that are supported
          const ENVIRONMENTS = ['theorem', 'lemma', 'proposition', 'corollary', 'definition'];
          const envPattern = ENVIRONMENTS.join('|');
          const regex = new RegExp(
            `\\\\begin\\{(${envPattern})\\}(?:\\[([^\\]]+)\\])?([\\s\\S]*?)\\\\end\\{\\1\\}`,
            'g'
          );
          
          let envMatch;
          while ((envMatch = regex.exec(text)) !== null) {
            const [fullMatch, envType, colorArg, content] = envMatch;
            const theoremElement = createTheoremWrapper(envType, colorArg, content);
            
            // Skip if wrapper creation failed (e.g., content too long)
            if (!theoremElement) {
              continue;
            }
            
            // Replace the text node with the theorem element
            const parent = textNode.parentNode;
            parent.insertBefore(theoremElement, textNode);
            
            // Process the content inside the theorem for LaTeX
            const contentDiv = theoremElement.querySelector('.tex-theorem-content');
            if (contentDiv) {
              // Recursively process LaTeX in the theorem content
              detectAndRenderLatex(contentDiv);
            }
            
            // Mark as processed
            parent.setAttribute('data-tex-processing-node', 'true');
            hasChanges = true;
          }
          
          // Remove the original text node if we processed theorem environments
          if (hasChanges) {
            textNode.remove();
            return;
          }
        }

        // Process both display and inline math in a single pass
        const matches = [];
        let match;
        
        // Find all display math matches - $$ patterns
        LATEX_PATTERNS.display.lastIndex = 0;
        while ((match = LATEX_PATTERNS.display.exec(text)) !== null) {
          // Skip if LaTeX has trailing/leading spaces
          if (match[1].trim() !== match[1]) {
            continue;
          }
          matches.push({
            type: 'display',
            start: match.index,
            end: match.index + match[0].length,
            latex: match[1],
            full: match[0]
          });
        }
        
        // Find all display math matches - \[...\] patterns
        LATEX_PATTERNS.displayBracket.lastIndex = 0;
        while ((match = LATEX_PATTERNS.displayBracket.exec(text)) !== null) {
          // Skip if LaTeX has trailing/leading spaces
          if (match[1].trim() !== match[1]) {
            continue;
          }
          matches.push({
            type: 'display',
            start: match.index,
            end: match.index + match[0].length,
            latex: match[1],
            full: match[0]
          });
        }
        
        // Find all inline math matches - $ patterns
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
            // Skip if LaTeX has trailing/leading spaces
            if (match[1].trim() !== match[1]) {
              continue;
            }
            // Skip if this individual match looks like currency (e.g., $50, $19.99)
            // But allow math with operators (e.g., $1 + 1 = 2$)
            if (isCurrency(match[0])) {
              continue;
            }
            matches.push({
              type: 'inline',
              start: match.index,
              end: match.index + match[0].length,
              latex: match[1],
              full: match[0]
            });
          }
        }
        
        // Find all inline math matches - \(...\) patterns
        LATEX_PATTERNS.inlineParenthesis.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inlineParenthesis.exec(text)) !== null) {
          // Check if this overlaps with any existing math
          let overlaps = false;
          for (const existingMatch of matches) {
            if (match.index >= existingMatch.start && 
                match.index < existingMatch.end) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            // Skip if LaTeX has trailing/leading spaces
            if (match[1].trim() !== match[1]) {
              continue;
            }
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
          
          // Helper to restore escaped dollar signs
          const restoreEscapedDollar = (str) => {
            if (hasEscapedDollar) {
              // In text content, \$ should be displayed as just $
              return str.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$');
            }
            return str;
          };
          
          for (const match of matches) {
            // Add text before the match
            if (match.start > lastIndex) {
              const textBefore = text.substring(lastIndex, match.start);
              newNodes.push(document.createTextNode(restoreEscapedDollar(textBefore)));
            }
            
            // Create and add math element based on mode
            let mathElement = null;
            
            // Check if this is a naive TeX match or we should use Simple Math mode
            if ((match.isNaive || TeXForGmail.simpleMode) && (TeXForGmail.settings?.enableSimpleMath)) {
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
              // Note: match.full shouldn't have placeholders since it's from the original pattern
              newNodes.push(document.createTextNode(match.full));
            }
            
            lastIndex = match.end;
          }
          
          // Add remaining text after last match
          if (lastIndex < text.length) {
            const remainingText = text.substring(lastIndex);
            newNodes.push(document.createTextNode(restoreEscapedDollar(remainingText)));
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
        } else if (hasEscapedDollar) {
          // No LaTeX patterns found, but we need to restore escaped dollar signs
          // In text content, \$ should be displayed as just $
          const restoredText = text.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$');
          if (restoredText !== textNode.textContent) {
            textNode.textContent = restoredText;
            hasChanges = true;
          }
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
  async function addTexButton(composeElement) {
    // Check settings for button visibility
    const settings = await TeXForGmail.getSettings();
    if (!settings.showComposeButton) {
      TeXForGmail.log('Compose button disabled in settings');
      return;
    }
    
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

  // Check for compose windows and reading views
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
    
    // Also check for reading views
    checkForReadingView();
  }
  
  // Check for email reading views and add buttons if needed
  function checkForReadingView() {
    // Email content selectors: .ii (message body), .a3s (conversation), .adP (expanded)
    const emailContainers = document.querySelectorAll('.ii, .a3s, .adP');
    
    emailContainers.forEach(container => {
      // Find the email's toolbar - check multiple possible locations
      const toolbarSelectors = ['.btC', '.aqK', '.G-atb', '.iH > div', '.aaq'];
      let toolbar = null;
      
      // Try to find a toolbar associated with this email
      for (const selector of toolbarSelectors) {
        const parent = container.closest('.h7, .adn, .Bs');
        if (parent) {
          toolbar = parent.querySelector(selector);
          if (toolbar) break;
        }
      }
      
      // If we found a toolbar and haven't already added a button
      if (toolbar && !TeXForGmail.readButtons.get(toolbar)) {
        TeXForGmail.log('Found email reading view, adding button');
        addReadModeButton(container, toolbar);
      }
    });
    
    // Clean up buttons for closed email views
    TeXForGmail.readButtons.forEach((button, toolbar) => {
      if (!document.body.contains(toolbar)) {
        TeXForGmail.readButtons.delete(toolbar);
        TeXForGmail.log('Cleaned up read mode button for removed toolbar');
      }
    });
  }
  
  // Add TeX button to email reading mode
  async function addReadModeButton(emailContainer, toolbar) {
    // Check settings for button visibility
    const settings = await TeXForGmail.getSettings();
    if (!settings.showReadButton) {
      TeXForGmail.log('Read mode button disabled in settings');
      return;
    }
    
    // Check if button already exists
    if (TeXForGmail.readButtons.get(toolbar)) {
      TeXForGmail.log('Read mode button already exists for this toolbar');
      return;
    }
    
    // Create button similar to compose button
    const button = createTexButton();
    
    // Store button reference
    TeXForGmail.readButtons.set(toolbar, button);
    
    // Button click handler for read mode
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      TeXForGmail.log('Read mode TeX button clicked');
      
      // Check if already processing
      if (TeXForGmail.processingStates.get(button)) {
        TeXForGmail.log('Already processing, ignoring click');
        return;
      }
      
      // Set processing state
      TeXForGmail.processingStates.set(button, true);
      
      try {
        // Toggle button state
        const isActive = button.getAttribute('aria-pressed') === 'true';
        
        if (!isActive) {
          // Activate and render
          button.style.background = '#e3f2fd';
          button.setAttribute('aria-pressed', 'true');
          
          // Render LaTeX in the email via non-destructive overlay
          await TeXForGmail.renderReadOverlay(emailContainer);
          
          showToast('LaTeX rendered in email', 'success');
          TeXForGmail.log('Read mode LaTeX rendering complete');
        } else {
          // Deactivate - restore original content if possible
          button.style.background = '';
          button.setAttribute('aria-pressed', 'false');
          
          // Remove overlay (original content remains untouched)
          TeXForGmail.removeReadOverlay(emailContainer);
          
          showToast('LaTeX rendering disabled', 'info');
        }
      } catch (error) {
        TeXForGmail.log('Error in read mode button handler:', error);
        showToast('Error rendering LaTeX', 'error');
      } finally {
        // Clear processing state
        TeXForGmail.processingStates.delete(button);
      }
    });
    
    // Find appropriate place to insert button
    const buttonGroup = toolbar.querySelector('.aaq, .btC, .G-atb');
    if (buttonGroup) {
      // Add some spacing
      button.style.marginLeft = '8px';
      buttonGroup.appendChild(button);
    } else {
      // Fallback: add to toolbar directly
      toolbar.appendChild(button);
    }
    
    TeXForGmail.log('Read mode TeX button added to toolbar');
  }

  // Set up mutation observer with debouncing
  TeXForGmail.setupObserver = function() {
    const debouncedCheck = debounce(checkForComposeWindow, CONFIG.debounceDelay);
    
    this.observer = new MutationObserver(debouncedCheck);
    this.observer.observe(document.body, CONFIG.observerConfig);
    TeXForGmail.log('Observer watching for compose windows');
    
    // Set up send button interceptor for ensuring rendered math in emails
    this.setupSendInterceptor();
    
    // Set up More menu observer for Gmail integration
    this.setupMoreMenuObserver();
  };
  
  // Set up observer for Gmail More menu integration
  TeXForGmail.setupMoreMenuObserver = function() {
    let menuObserver = null;
    
    // Function to check if email contains LaTeX
    const containsLatex = (emailElement) => {
      if (!emailElement) return false;
      const text = emailElement.textContent || '';
      // Check for LaTeX delimiters
      return /\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\[\[\(][\s\S]+?\\[\]\)]|\\begin\{[\s\S]+?\\end\{/g.test(text);
    };
    
    // Function to add menu item
    const addRenderMenuItem = (menu, emailElement) => {
      // Check if already added
      if (menu.querySelector('.tex-gmail-menu-item')) return;
      
      // Find existing menu items to clone structure
      const existingItem = menu.querySelector('.J-N');
      if (!existingItem) return;
      
      // Create new menu item
      const menuItem = existingItem.cloneNode(true);
      menuItem.className = existingItem.className + ' tex-gmail-menu-item';
      
      // Update text - look for text element
      const textElement = menuItem.querySelector('[role="menuitem"]') || menuItem;
      textElement.textContent = 'Render LaTeX';
      
      // Add click handler
      menuItem.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        TeXForGmail.log('More menu: Render LaTeX clicked');
        
        // Close the menu
        const backdrop = document.querySelector('.J-M-Jz');
        if (backdrop) backdrop.click();
        
        // Render LaTeX in the email via non-destructive overlay
        showToast('Rendering LaTeX in email...', 'info');
        await TeXForGmail.renderReadOverlay(emailElement);
        showToast('LaTeX rendering complete', 'success');
      });
      
      // Add separator if needed
      const separator = menu.querySelector('.J-Kh');
      if (separator) {
        const newSeparator = separator.cloneNode(true);
        menu.appendChild(newSeparator);
      }
      
      // Add the menu item
      menu.appendChild(menuItem);
      TeXForGmail.log('Added Render LaTeX to More menu');
    };
    
    // Observer for More menu appearance
    const moreMenuObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check for menu container
            const menu = node.querySelector?.('.J-M') || (node.classList?.contains('J-M') ? node : null);
            if (menu) {
              TeXForGmail.log('More menu detected');
              
              // Find the associated email element
              const emailElement = document.querySelector('.ii:hover, .a3s:hover, .adP:hover') ||
                                  document.querySelector('.ii, .a3s, .adP');
              
              // Only add if email contains LaTeX
              if (emailElement && containsLatex(emailElement)) {
                addRenderMenuItem(menu, emailElement);
              }
            }
          }
        });
      });
    });
    
    // Start observing
    moreMenuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.moreMenuObserver = moreMenuObserver;
    this.log('More menu observer initialized');
  };
  
  // Set up global keyboard event handler
  TeXForGmail.setupKeyboardHandler = function() {
    if (!this.keyboardHandler) {
      this.keyboardHandler = this.handleGlobalKeyboard.bind(this);
      document.addEventListener('keydown', this.keyboardHandler, true);
      this.log('Keyboard handler registered');
    }
  };
  
  // Handle global keyboard events for LaTeX rendering
  TeXForGmail.handleGlobalKeyboard = async function(e) {
    // Load settings
    const settings = await this.getSettings();
    const isShortcutKey = (e.key === 'F8' || e.key === 'F9');
    const hasModifier = e.ctrlKey || e.metaKey;

    // If shortcuts are disabled, show a warning toast when user presses the keys
    if (!settings?.enableKeyboardShortcuts) {
      if (isShortcutKey || (e.ctrlKey && e.shiftKey)) {
        const shortcutType = hasModifier ? 'continuous' : 'single';
        showToast(`Keyboard shortcuts are disabled. Enable them in TeX for Gmail settings.`, 'warning');
        return;
      }
    }
    
    // Check if we're in a compose area for template shortcuts
    const composeArea = this.getActiveTarget();
    
    // Tab navigation for templates
    if (e.key === 'Tab' && composeArea && settings?.enableKeyboardShortcuts) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Check if we're in a text node with LaTeX content containing empty {}
        if (container.nodeType === Node.TEXT_NODE && 
            container.textContent.includes('{}')) {
          e.preventDefault();
          e.stopPropagation();
          this.navigateTemplate(e.shiftKey ? 'prev' : 'next');
          return;
        }
      }
    }
    
    // Ctrl+Shift template shortcuts
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && settings?.enableKeyboardShortcuts) {
      const template = this.TEX_TEMPLATES[e.key.toUpperCase()];
      if (template && composeArea) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.insertTexTemplate(template.template)) {
          showToast(`Inserted ${template.name}`, 'info');
          this.log(`Template shortcut: Inserted ${template.name}`);
        }
        return;
      }
    }
    
    // F8: Rich Math once
    if (e.key === 'F8' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const target = this.getActiveTarget();
      if (target) {
        this.log('F8 pressed: Rendering Rich Math once');
        showToast('Rendering LaTeX as Rich Math...', 'info');
        await this.renderOnceRichMath(target);
        showToast('Rich Math rendering complete', 'success');
      }
    }
    // F9: Simple Math once  
    else if (e.key === 'F9' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const target = this.getActiveTarget();
      if (target) {
        if (!settings.enableSimpleMath) {
          showToast('Simple Math mode is disabled in settings', 'warning');
          return;
        }
        this.log('F9 pressed: Rendering Simple Math once');
        showToast('Rendering LaTeX as Simple Math...', 'info');
        await this.renderOnceSimpleMath(target);
        showToast('Simple Math rendering complete', 'success');
      }
    }
    // Cmd/Ctrl+F8: Toggle continuous Rich Math
    else if (e.key === 'F8' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      this.log('Cmd/Ctrl+F8 pressed: Toggling continuous Rich Math');
      await this.toggleContinuousMode('rich');
    }
    // Cmd/Ctrl+F9: Toggle continuous Simple Math
    else if (e.key === 'F9' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      this.log('Cmd/Ctrl+F9 pressed: Toggling continuous Simple Math');
      if (!settings.enableSimpleMath) {
        showToast('Simple Math mode is disabled in settings', 'warning');
        return;
      }
      await this.toggleContinuousMode('simple');
    }
  };
  
  // Get the active target element (compose or read mode)
  TeXForGmail.getActiveTarget = function() {
    // Check if we're in a compose window
    const activeElement = document.activeElement;
    
    // First check if focus is in a compose area
    const composeArea = activeElement?.closest('.M9, .AD, .aoI, [contenteditable="true"]');
    if (composeArea) {
      this.log('Active target: Compose area');
      return composeArea;
    }
    
    // Check if we're viewing an email (read mode)
    const emailContainers = document.querySelectorAll('.ii, .a3s, .adP');
    if (emailContainers.length > 0) {
      // Return the first visible email container
      for (const container of emailContainers) {
        if (container.offsetParent !== null) { // Check if visible
          this.log('Active target: Email reading area');
          return container;
        }
      }
    }
    
    this.log('No active target found');
    return null;
  };
  
  // Render LaTeX once with Rich Math (API/images)
  TeXForGmail.renderOnceRichMath = async function(targetElement) {
    this.log('Rendering once with Rich Math');
    
    // Temporarily set mode to Rich Math
    const previousMode = this.simpleMode;
    this.simpleMode = false;
    
    try {
      // Check if it's a read mode email
      const isReadMode = targetElement.classList.contains('ii') || 
                        targetElement.classList.contains('a3s') || 
                        targetElement.classList.contains('adP');
      if (isReadMode) {
        await this.renderReadOverlay(targetElement);
      } else {
        // Render without setting up observers
        await detectAndRenderLatex(targetElement, {
          oneTimeRender: true,
          isReadMode: false
        });
      }
      
      this.log('One-time Rich Math rendering complete');
      return Promise.resolve();
    } catch (error) {
      this.log('Error in renderOnceRichMath:', error);
      showToast('Error rendering Rich Math', 'error');
      return Promise.reject(error);
    } finally {
      // Restore previous mode
      this.simpleMode = previousMode;
    }
  };
  
  // Render LaTeX once with Simple Math (HTML/CSS)
  TeXForGmail.renderOnceSimpleMath = async function(targetElement) {
    this.log('Rendering once with Simple Math');
    const settings = await this.getSettings();
    if (!settings?.enableSimpleMath) {
      showToast('Simple Math mode is disabled in settings', 'warning');
      return;
    }
    
    // Temporarily set mode to Simple Math
    const previousMode = this.simpleMode;
    this.simpleMode = true;
    
    try {
      // Check if it's a read mode email
      const isReadMode = targetElement.classList.contains('ii') || 
                        targetElement.classList.contains('a3s') || 
                        targetElement.classList.contains('adP');
      if (isReadMode) {
        await this.renderReadOverlay(targetElement);
      } else {
        // Render without setting up observers
        await detectAndRenderLatex(targetElement, {
          oneTimeRender: true,
          isReadMode: false
        });
      }
      
      this.log('One-time Simple Math rendering complete');
      return Promise.resolve();
    } catch (error) {
      this.log('Error in renderOnceSimpleMath:', error);
      showToast('Error rendering Simple Math', 'error');
      return Promise.reject(error);
    } finally {
      // Restore previous mode
      this.simpleMode = previousMode;
    }
  };
  
  // Toggle continuous rendering mode
  TeXForGmail.toggleContinuousMode = async function(mode) {
    const settings = await this.getSettings();
    if (mode === 'simple' && !settings?.enableSimpleMath) {
      showToast('Simple Math mode is disabled in settings', 'warning');
      return;
    }
    const target = this.getActiveTarget();
    if (!target) {
      showToast('No active compose or email area found', 'error');
      return;
    }
    
    // Check if it's a compose area
    const isComposeArea = target.closest('.M9, .AD, .aoI, [contenteditable="true"]');
    
    if (isComposeArea) {
      // Find the TeX button for this compose area
      const toolbar = isComposeArea.closest('.M9, .AD, .aoI')?.querySelector('.btC, .aaq, .aaZ');
      const button = toolbar ? this.composeButtons.get(toolbar) : null;
      
      if (button) {
        // Get current state
        const currentState = getToggleState(isComposeArea);
        const newMode = mode === 'simple' ? 'simple' : 'api';
        
        if (currentState === 'off' || currentState !== newMode) {
          // Turn on with the requested mode
          this.simpleMode = (mode === 'simple');
          setToggleState(isComposeArea, newMode);
          
          // Update button appearance
          button.style.background = '#e3f2fd';
          button.setAttribute('aria-pressed', 'true');
          
          // Start continuous rendering
          setupContentObserver(isComposeArea);
          detectAndRenderLatex(isComposeArea);
          
          const modeText = mode === 'simple' ? 'Simple Math' : 'Rich Math';
          showToast(`Continuous ${modeText} rendering enabled`, 'success');
          this.log(`Toggled continuous ${modeText} mode ON`);
        } else {
          // Turn off
          setToggleState(isComposeArea, 'off');
          
          // Update button appearance
          button.style.background = '';
          button.setAttribute('aria-pressed', 'false');
          
          // Stop rendering and restore content
          restoreOriginalContent(isComposeArea);
          removeContentObserver(isComposeArea);
          
          showToast('Continuous rendering disabled', 'info');
          this.log('Toggled continuous mode OFF');
        }
      } else {
        // No button found, but we can still render once
        showToast('TeX button not found, rendering once', 'warning');
        if (mode === 'simple') {
          await this.renderOnceSimpleMath(target);
        } else {
          await this.renderOnceRichMath(target);
        }
      }
    } else {
      // For read mode, just render once (no continuous mode)
      showToast('Rendering LaTeX in email...', 'info');
      if (mode === 'simple') {
        await this.renderOnceSimpleMath(target);
      } else {
        await this.renderOnceRichMath(target);
      }
      showToast('Email rendering complete', 'success');
    }
  };
  
  // Send behavior dialog functions
  function createSendDialog() {
    // Check if dialog already exists
    if (document.getElementById('tex-gmail-send-dialog')) {
      return document.getElementById('tex-gmail-send-dialog');
    }
    
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.id = 'tex-gmail-send-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 8px;
      box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2);
      z-index: 9999;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      display: none;
      font-family: 'Roboto', 'Google Sans', Arial, sans-serif;
    `;
    
    // Create dialog content
    dialog.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 400; color: #202124;">
          LaTeX Rendering
        </h2>
        <p style="margin: 0; color: #5f6368; font-size: 14px; line-height: 20px;">
          Your email contains LaTeX equations. Would you like to render them as images before sending?
        </p>
        <div style="margin-top: 12px; padding: 12px; background: #f8f9fa; border-radius: 4px;">
          <p style="margin: 0; color: #5f6368; font-size: 12px;">
            <strong>Note:</strong> Rendering will convert LaTeX code into images that all recipients can view.
          </p>
        </div>
      </div>
      
      <div style="margin: 20px 0; padding: 12px 0; border-top: 1px solid #e8eaed;">
        <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px; color: #5f6368;">
          <input type="checkbox" id="tex-gmail-remember-choice" style="margin-right: 8px; cursor: pointer;">
          Remember my choice for this session
        </label>
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="tex-gmail-cancel-send" style="
          padding: 8px 16px;
          border: 1px solid #dadce0;
          background: white;
          color: #5f6368;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Cancel</button>
        <button id="tex-gmail-send-without-render" style="
          padding: 8px 16px;
          border: 1px solid #dadce0;
          background: white;
          color: #202124;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Send without rendering</button>
        <button id="tex-gmail-render-and-send" style="
          padding: 8px 16px;
          border: none;
          background: #1a73e8;
          color: white;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Render and Send</button>
      </div>
    `;
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'tex-gmail-dialog-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9998;
      display: none;
    `;
    
    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
      #tex-gmail-render-and-send:hover {
        background: #1557b0 !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      #tex-gmail-send-without-render:hover,
      #tex-gmail-cancel-send:hover {
        background: #f8f9fa !important;
        border-color: #9aa0a6 !important;
      }
      #tex-gmail-send-dialog button:focus {
        outline: 2px solid #1a73e8;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
    
    // Append to body
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    return dialog;
  }
  
  function showSendDialog() {
    return new Promise((resolve) => {
      const dialog = createSendDialog();
      const backdrop = document.getElementById('tex-gmail-dialog-backdrop');
      
      // Show dialog and backdrop
      dialog.style.display = 'block';
      backdrop.style.display = 'block';
      
      // Focus on render button for accessibility
      const renderButton = document.getElementById('tex-gmail-render-and-send');
      renderButton.focus();
      
      // Handle button clicks
      const cancelButton = document.getElementById('tex-gmail-cancel-send');
      const sendWithoutButton = document.getElementById('tex-gmail-send-without-render');
      const renderAndSendButton = document.getElementById('tex-gmail-render-and-send');
      const rememberCheckbox = document.getElementById('tex-gmail-remember-choice');
      
      // Clean up function
      const cleanup = () => {
        dialog.style.display = 'none';
        backdrop.style.display = 'none';
        // Remove event listeners
        cancelButton.removeEventListener('click', handleCancel);
        sendWithoutButton.removeEventListener('click', handleSendWithout);
        renderAndSendButton.removeEventListener('click', handleRenderAndSend);
        document.removeEventListener('keydown', handleEscape);
      };
      
      const handleCancel = () => {
        cleanup();
        resolve({ action: 'cancel', remember: rememberCheckbox.checked });
      };
      
      const handleSendWithout = () => {
        cleanup();
        resolve({ action: 'send_without_render', remember: rememberCheckbox.checked });
      };
      
      const handleRenderAndSend = () => {
        cleanup();
        resolve({ action: 'render_and_send', remember: rememberCheckbox.checked });
      };
      
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          handleRenderAndSend();
        }
      };
      
      // Attach event listeners
      cancelButton.addEventListener('click', handleCancel);
      sendWithoutButton.addEventListener('click', handleSendWithout);
      renderAndSendButton.addEventListener('click', handleRenderAndSend);
      document.addEventListener('keydown', handleEscape);
    });
  }

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
        // Check if there's LaTeX content
        const hasLatex = /\$[^$\n]+\$|\$\$[^$\n]+\$\$/.test(composeArea.textContent);
        
        if (hasLatex) {
          // Get current settings
          const settings = await TeXForGmail.getSettings();
          const currentState = getToggleState(composeArea);
          
          // Determine what to do based on settings and toggle state
          let shouldRender = false;
          let userChoice = null;
          
          if (currentState) {
            // Toggle is ON, LaTeX already rendered, allow normal send
            TeXForGmail.log('LaTeX already rendered (toggle is ON), allowing normal send');
            return;
          }
          
          // Toggle is OFF, check send behavior setting
          if (settings.sendBehavior === 'always') {
            shouldRender = true;
            TeXForGmail.log('Send behavior is "always", will render LaTeX');
          } else if (settings.sendBehavior === 'never') {
            shouldRender = false;
            TeXForGmail.log('Send behavior is "never", sending without rendering');
            return; // Allow send to proceed without rendering
          } else if (settings.sendBehavior === 'ask') {
            // Check if we have a remembered choice for this session
            if (settings.rememberSendChoice && settings.lastSendChoice) {
              shouldRender = settings.lastSendChoice === 'render';
              TeXForGmail.log(`Using remembered choice: ${settings.lastSendChoice}`);
            } else {
              // Show dialog to ask user
              TeXForGmail.log('Send behavior is "ask", showing dialog');
              
              // Prevent the original send
              event.preventDefault();
              event.stopImmediatePropagation();
              
              // Show dialog and wait for user choice
              userChoice = await showSendDialog();
              
              // Handle user choice
              if (userChoice.action === 'cancel') {
                TeXForGmail.log('User cancelled send');
                return;
              } else if (userChoice.action === 'send_without_render') {
                shouldRender = false;
                if (userChoice.remember) {
                  // Remember choice for this session
                  settings.rememberSendChoice = true;
                  settings.lastSendChoice = 'send_without';
                  storageService.set({
                    rememberSendChoice: true,
                    lastSendChoice: 'send_without'
                  });
                }
              } else if (userChoice.action === 'render_and_send') {
                shouldRender = true;
                if (userChoice.remember) {
                  // Remember choice for this session
                  settings.rememberSendChoice = true;
                  settings.lastSendChoice = 'render';
                  storageService.set({
                    rememberSendChoice: true,
                    lastSendChoice: 'render'
                  });
                }
              }
            }
          }
          
          if (shouldRender) {
            TeXForGmail.log('Intercepting send to render LaTeX');
            
            // Prevent the original send if not already prevented
            if (!userChoice) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
          
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
          
          // Handle send without render case
          if (!shouldRender && userChoice && userChoice.action === 'send_without_render') {
            // User chose to send without rendering
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
            
            setTimeout(() => {
              programmaticSendInProgress = false;
            }, 1000);
          }
        }
      }
    };
    
    // Listen for both click and keyboard events
    // Store references for cleanup
    TeXForGmail.sendInterceptorClick = interceptSend;
    TeXForGmail.sendInterceptorKeydown = interceptSend;
    document.addEventListener('click', interceptSend, true);
    document.addEventListener('keydown', interceptSend, true);
    
    TeXForGmail.log('Send interceptor initialized (click and keyboard)');
  };

  // Comprehensive cleanup function
  TeXForGmail.cleanup = function() {
    // Disconnect main observer
    if (TeXForGmail.observer) {
      TeXForGmail.observer.disconnect();
      TeXForGmail.log('Main observer disconnected');
    }
    
    // Remove keyboard handler
    if (TeXForGmail.keyboardHandler) {
      document.removeEventListener('keydown', TeXForGmail.keyboardHandler, true);
      TeXForGmail.keyboardHandler = null;
      TeXForGmail.log('Keyboard handler removed');
    }
    
    // Disconnect More menu observer
    if (TeXForGmail.moreMenuObserver) {
      TeXForGmail.moreMenuObserver.disconnect();
      TeXForGmail.moreMenuObserver = null;
      TeXForGmail.log('More menu observer disconnected');
    }
    
    // Remove send interceptor listeners
    if (TeXForGmail.sendInterceptorClick) {
      document.removeEventListener('click', TeXForGmail.sendInterceptorClick, true);
      TeXForGmail.sendInterceptorClick = null;
    }
    if (TeXForGmail.sendInterceptorKeydown) {
      document.removeEventListener('keydown', TeXForGmail.sendInterceptorKeydown, true);
      TeXForGmail.sendInterceptorKeydown = null;
    }
    
    // Remove chrome storage listener
    if (TeXForGmail.storageChangeListener) {
      chrome.storage.onChanged.removeListener(TeXForGmail.storageChangeListener);
      TeXForGmail.storageChangeListener = null;
    }
    
    // Clean up all button event listeners
    document.querySelectorAll('.tex-toggle-button').forEach(button => {
      // Clone and replace to remove all event listeners
      const newButton = button.cloneNode(true);
      if (button.parentNode) {
        button.parentNode.replaceChild(newButton, button);
      }
    });
    
    // Remove any read-mode overlays
    document.querySelectorAll('.tex-read-overlay').forEach(overlay => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    
    // Disconnect all content observers (WeakMap doesn't have iteration, but observers will be GC'd)
    if (TeXForGmail.composeObservers) {
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
    TeXForGmail.originalContent = new WeakMap();
    TeXForGmail.sendProcessingStates = new WeakMap();
    TeXForGmail.observerSetupFlags = new WeakMap();
    
    TeXForGmail.log('Comprehensive cleanup completed');
  };

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    TeXForGmail.cleanup();
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

  // Listen for settings changes from options page
  TeXForGmail.storageChangeListener = (changes, areaName) => {
    if (areaName === 'sync' || areaName === 'local') {
      // Update cached settings
      for (const key in changes) {
        if (TeXForGmail.settings) {
          TeXForGmail.settings[key] = changes[key].newValue;
        }
      }
      
      // Apply relevant changes immediately
      if (changes.dpiInline) {
        CONFIG.dpi.inline = changes.dpiInline.newValue;
      }
      if (changes.dpiDisplay) {
        CONFIG.dpi.display = changes.dpiDisplay.newValue;
      }
      if (changes.renderServer) {
        TeXForGmail.serverPreference = changes.renderServer.newValue;
      }
      if (changes.enableNaiveTeX) {
        TeXForGmail.naiveTexMode = changes.enableNaiveTeX.newValue;
        TeXForGmail.log(`Naive TeX mode ${changes.enableNaiveTeX.newValue ? 'enabled' : 'disabled'}`);
      }
      
      TeXForGmail.log('Settings updated from options page:', changes);
    }
  };
  chrome.storage.onChanged.addListener(TeXForGmail.storageChangeListener);
  
  // Listen for messages from options page
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SETTINGS_UPDATED') {
      TeXForGmail.settings = request.settings;
      TeXForGmail.log('Settings updated via message:', request.settings);
    }
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
