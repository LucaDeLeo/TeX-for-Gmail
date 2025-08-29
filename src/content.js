// TeX for Gmail - Content Script (fully patched)
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
    observerConfig: { childList: true, subtree: true },
    debounceDelay: 100,            // For DOM observer; updated from settings
    renderDebounceDelay: 500,      // For LaTeX rendering; updated from settings if provided
    toastDuration: 3000,
    dpi: {
      inline: 110,  // Inline equations: better text sizing
      display: 300  // Display equations: higher fidelity
    },
    size: { inline: '\\normalsize', display: '\\large' },
    maxApiCallsPerMinute: 60,      // Rate limiting; updated from settings
    maxLatexLength: 1000           // Maximum LaTeX string length
  };

  // Safe Chrome API helpers to avoid crashes in non-extension contexts
  function chromeStorageAvailable() {
    return (typeof chrome !== 'undefined') && chrome.storage && (chrome.storage.sync || chrome.storage.local);
  }
  function safeChromeSync() {
    return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) ? chrome.storage.sync : null;
  }
  function safeChromeLocal() {
    return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  }

  // Storage Service with quota handling and fallback
  class StorageService {
    constructor() {
      this.syncQuotaExceeded = false;
      this.performanceMetrics = new Map();
      this.validationRules = {
        sendBehavior: { type: 'enum', values: ['always', 'never', 'ask'], default: 'ask' },
        renderServer: { type: 'enum', values: ['codecogs', 'wordpress'], default: 'codecogs' },
        dpiInline: { type: 'number', min: 100, max: 400, default: 110 },
        dpiDisplay: { type: 'number', min: 100, max: 400, default: 300 },
        simpleMathFontOutgoing: { type: 'font', maxLength: 100, default: 'serif' },
        simpleMathFontIncoming: { type: 'font', maxLength: 100, default: 'serif' },
        showComposeButton: { type: 'boolean', default: true },
        showReadButton: { type: 'boolean', default: true },
        showCopyLatex: { type: 'boolean', default: true },
        enableKeyboardShortcuts: { type: 'boolean', default: true },
        rememberSendChoice: { type: 'boolean', default: false },
        lastSendChoice: { type: 'enum', values: ['render', 'send_without', null], default: null },
        serverFallback: { type: 'boolean', default: true },
        enableNaiveTeX: { type: 'boolean', default: false },
        enableSimpleMath: { type: 'boolean', default: true },
        autoRenderOnCompose: { type: 'boolean', default: true },
        maxApiCallsPerMinute: { type: 'number', min: 1, max: 1000, default: 60 },
        debounceDelay: { type: 'number', min: 100, max: 5000, default: 500 },
        debugMode: { type: 'boolean', default: false },
        enableAbbreviations: { type: 'boolean', default: false }
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
      // Shim namespace for environments without Chrome APIs
      this.shimStorageKey = 'tfg_settings';
    }
    // Sanitize font name to prevent CSS injection
    sanitizeFontName(font) {
      if (!font) return 'serif';
      let sanitized = font.toString().replace(/[^a-zA-Z0-9\s\-]/g, '');
      const fontLower = sanitized.toLowerCase();
      const isAllowed = this.allowedFonts.some(allowed => allowed.toLowerCase() === fontLower);
      if (!isAllowed) {
        console.warn(`Invalid font name "${font}", using default "serif"`);
        return 'serif';
      }
      return sanitized;
    }
    // Validate a single value based on rules
    validateValue(key, value, rule) {
      if (!rule) return { valid: true, value };
      if (value === null || value === undefined) {
        if (rule.default !== undefined) return { valid: true, value: rule.default };
        if (rule.required) return { valid: false, error: `${key} is required`, value: rule.default };
        return { valid: true, value: rule.default || null };
      }
      switch (rule.type) {
        case 'boolean':
          if (typeof value === 'string') value = value.toLowerCase() === 'true' || value === '1' || value === 'yes';
          return { valid: true, value: Boolean(value) };
        case 'number': {
          const num = Number(value);
          if (isNaN(num) || !isFinite(num)) {
            console.warn(`${key}: Invalid number "${value}", using default ${rule.default}`);
            return { valid: true, value: rule.default ?? rule.min ?? 0 };
          }
          let clamped = num;
          if (rule.min !== undefined && num < rule.min) { console.warn(`${key}: ${num} clamped to min ${rule.min}`); clamped = rule.min; }
          if (rule.max !== undefined && num > rule.max) { console.warn(`${key}: ${num} clamped to max ${rule.max}`); clamped = rule.max; }
          return { valid: true, value: Math.round(clamped) };
        }
        case 'enum': {
          if (value === null && rule.values.includes(null)) return { valid: true, value: null };
          const norm = typeof value === 'string' ? value.toLowerCase() : value;
          const validValue = rule.values.find(v => (typeof v === 'string' ? v.toLowerCase() : v) === norm);
          if (validValue === undefined) {
            const def = rule.default !== undefined ? rule.default : rule.values[0];
            console.warn(`${key}: Invalid value "${value}", using default "${def}"`);
            return { valid: true, value: def };
          }
          return { valid: true, value: validValue };
        }
        case 'font': {
          const sanitized = this.sanitizeFontName(value);
          if (!sanitized || sanitized.length === 0) return { valid: true, value: rule.default || 'serif' };
          if (rule.maxLength && sanitized.length > rule.maxLength) return { valid: true, value: sanitized.substring(0, rule.maxLength) };
          return { valid: true, value: sanitized };
        }
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
            if (result.value !== undefined) validated[key] = result.value;
          } else {
            validated[key] = result.value;
          }
        } else {
          console.warn(`Unknown setting key: ${key}`);
          validated[key] = value;
        }
      }
      if (errors.length > 0) console.warn('Validation warnings:', errors);
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
        performance.mark(endMark);
        const duration = performance.now() - startTime;
        performance.measure(`storage-${operationName}`, startMark, endMark);
        if (!this.performanceMetrics.has(operationName)) this.performanceMetrics.set(operationName, []);
        this.performanceMetrics.get(operationName).push(duration);
        if (duration > 100) console.warn(`Storage operation "${operationName}" took ${duration.toFixed(2)}ms (>100ms)`);
        return result;
      } catch (error) {
        performance.mark(endMark);
        performance.measure(`storage-${operationName}-failed`, startMark, endMark);
        throw error;
      } finally {
        try {
          performance.clearMarks(startMark);
          performance.clearMarks(endMark);
          performance.clearMeasures(`storage-${operationName}`);
          performance.clearMeasures(`storage-${operationName}-failed`);
        } catch (_) {}
      }
    }
    // Set data with validation and automatic fallback
    async set(data) {
      const now = Date.now();
      const since = now - this.lastStorageOperation;
      if (since < this.minOperationInterval) {
        const wait = this.minOperationInterval - since;
        console.warn(`Rate limiting: waiting ${wait}ms before storage operation`);
        await new Promise(r => setTimeout(r, wait));
      }
      this.lastStorageOperation = Date.now();
      return this.measureOperation('set', async () => {
        const { data: validated, errors } = this.validateAndSanitize(data);
        if (errors.length > 0) console.warn('Data validation warnings during storage:', errors);
        const size = JSON.stringify(validated).length;
        if (size > 8192) console.warn(`Large data size (${size} bytes), may exceed chrome sync item limit`);

        const syncArea = safeChromeSync();
        const localArea = safeChromeLocal();

        // Prefer Chrome sync when available and not quota-exceeded
        if (syncArea && !this.syncQuotaExceeded && typeof syncArea.set === 'function') {
          try {
            await syncArea.set(validated);
            return { storage: 'sync', success: true, validated: true };
          } catch (error) {
            if (error && typeof error.message === 'string' && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
              this.syncQuotaExceeded = true;
              console.warn('Chrome sync storage quota exceeded, falling back to local storage');
            } else {
              console.warn('Chrome sync storage failed, will try local/shim:', error);
            }
          }
        }

        // Fallback to Chrome local if available
        if (localArea && typeof localArea.set === 'function') {
          try {
            await localArea.set(validated);
            return { storage: 'local', success: true, fallback: true, validated: true };
          } catch (localError) {
            console.warn('Chrome local storage failed, will try shim:', localError);
          }
        }

        // Final fallback to in-page shim
        await this.shimSet(validated);
        return { storage: 'shim', success: true, fallback: true, validated: true };
      });
    }
    // Get data with automatic fallback
    async get(keys) {
      return this.measureOperation('get', async () => {
        const syncArea = safeChromeSync();
        const localArea = safeChromeLocal();
        // Try Chrome sync first
        if (syncArea && typeof syncArea.get === 'function') {
          try {
            const syncData = await syncArea.get(keys);
            if (syncData && Object.keys(syncData).length > 0) return syncData;
          } catch (e) {
            console.warn('Chrome sync get failed, will try local/shim:', e);
          }
        }
        // Then Chrome local
        if (localArea && typeof localArea.get === 'function') {
          try {
            const localData = await localArea.get(keys);
            if (localData && Object.keys(localData).length > 0) return localData;
          } catch (e) {
            console.warn('Chrome local get failed, will try shim:', e);
          }
        }
        // Finally shim
        return this.shimGet(keys);
      });
    }
    // Clear specific keys from both storages
    async remove(keys) {
      return this.measureOperation('remove', async () => {
        const syncArea = safeChromeSync();
        const localArea = safeChromeLocal();
        const result = { sync: false, local: false };
        if (syncArea && typeof syncArea.remove === 'function') {
          try { await syncArea.remove(keys); result.sync = true; } catch (_) { /* no-op */ }
        }
        if (localArea && typeof localArea.remove === 'function') {
          try { await localArea.remove(keys); result.local = true; } catch (_) { /* no-op */ }
        }
        if (result.sync || result.local) return result;
        await this.shimRemove(keys);
        return { sync: false, local: false, shim: true };
      });
    }
    // ---- Shim helpers for non-extension environments ----
    shimReadAll() {
      try {
        const raw = localStorage.getItem(this.shimStorageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (_) { return {}; }
    }
    shimWriteAll(obj) {
      try {
        const all = this.shimReadAll();
        const merged = { ...all, ...obj };
        localStorage.setItem(this.shimStorageKey, JSON.stringify(merged));
      } catch (_) { /* no-op */ }
    }
    async shimSet(obj) { this.shimWriteAll(obj); return true; }
    async shimGet(keys) {
      const all = this.shimReadAll();
      if (keys == null) return all;
      if (Array.isArray(keys)) {
        const out = {}; keys.forEach(k => { if (k in all) out[k] = all[k]; }); return out;
      }
      if (typeof keys === 'string') { return { [keys]: all[keys] }; }
      if (typeof keys === 'object') { return { ...keys, ...all }; }
      return all;
    }
    async shimRemove(keys) {
      const all = this.shimReadAll();
      if (Array.isArray(keys)) { keys.forEach(k => { delete all[k]; }); }
      else if (typeof keys === 'string') { delete all[keys]; }
      else if (typeof keys === 'object') { Object.keys(keys).forEach(k => { delete all[k]; }); }
      try { localStorage.setItem(this.shimStorageKey, JSON.stringify(all)); } catch (_) { /* no-op */ }
      return true;
    }
    // Get performance report
    getPerformanceReport() {
      const report = {};
      for (const [operation, times] of this.performanceMetrics) {
        const sorted = [...times].sort((a, b) => a - b);
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

  // Global storage service instance
  const storageService = new StorageService();

  // Main namespace object for state management
  const TeXForGmail = {
    observer: null,
    composeButtons: new WeakMap(),
    readButtons: new Map(),
    processingStates: new WeakMap(),
    composeObservers: new WeakMap(),
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
    renderTimeouts: new WeakMap(),
    toggleStates: new WeakMap(),       // boolean ON/OFF only
    originalContent: new WeakMap(),    // original snapshot (fallback-only)
    removalObservers: new WeakMap(),
    sendProcessingStates: new WeakMap(),
    observerSetupFlags: new WeakMap(),
    apiCallTimes: [],
    debugMode: false,
    simpleMode: false,
    naiveTexMode: false,
    serverPreference: 'codecogs',
    serverSwitchMutex: false,
    serverSwitchTimestamp: 0,
    settings: null,
    settingsLoadPromise: null,

    async init() {
      console.log('🚀 TeX for Gmail: Extension initializing...');
      this.log('Extension initialized');
      // Load settings first and await them
      await this.loadSettings();
      ensureLiveRegions();
      // Back-compat server preference from sessionStorage
      try {
        const savedPreference = sessionStorage.getItem('tex-gmail-server-preference');
        if (savedPreference && ['codecogs', 'wordpress'].includes(savedPreference)) {
          this.serverPreference = savedPreference;
          this.log('Loaded server preference:', savedPreference);
          if (this.settings) {
            this.settings.renderServer = savedPreference;
            storageService.set({ renderServer: savedPreference });
            sessionStorage.removeItem('tex-gmail-server-preference');
          }
        }
      } catch (_) {
        this.log('Could not load server preference from sessionStorage');
      }
      this.setupObserver();
      checkForComposeWindow(); // immediate scan
      this.setupKeyboardHandler();
      ensureCopyInteractions();
      ensureContextMenu();
    },

    ensureOverlayStyles() {
      if (document.getElementById('tex-read-overlay-styles')) return;
      const style = document.createElement('style');
      style.id = 'tex-read-overlay-styles';
      style.textContent = `
        .tex-read-overlay { position: absolute; inset: 0; width: 100%; background: transparent !important; z-index: 1; pointer-events: auto; }
        .tex-read-overlay-content { position: relative; pointer-events: none; }
        .tex-read-overlay-content > * { visibility: hidden !important; }
        .tex-read-overlay .tex-math-inline,
        .tex-read-overlay .tex-math-display { visibility: visible !important; pointer-events: auto; }
      `;
      document.head.appendChild(style);
    },

    getReadOverlay(emailContainer) {
      const computed = window.getComputedStyle(emailContainer);
      if (!['relative','absolute','fixed','sticky'].includes(computed.position)) {
        emailContainer.style.position = 'relative';
      }
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
        // Clone email HTML into overlay
        content.innerHTML = emailContainer.innerHTML;
        // Neutralize existing media to avoid double-loading trackers
        content.querySelectorAll('img,iframe,video').forEach(el => {
          if (el.hasAttribute('src')) el.setAttribute('data-src', el.getAttribute('src'));
          el.removeAttribute('src');
        });
        await detectAndRenderLatex(content, { oneTimeRender: true, isReadMode: true });
        return true;
      } catch (e) {
        this.log('Error rendering read overlay:', e);
        return false;
      }
    },

    log(message, ...args) { if (this.debugMode || message.includes('Error')) console.log(`TeX for Gmail: ${message}`, ...args); },

    // Rate limiting check
    checkRateLimit() {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      this.apiCallTimes = this.apiCallTimes.filter(time => time > oneMinuteAgo);
      if (this.apiCallTimes.length >= CONFIG.maxApiCallsPerMinute) {
        this.log('Warning: API rate limit reached');
        return false;
      }
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
        showCopyLatex: true,
        enableKeyboardShortcuts: true,
        enableNaiveTeX: false,
        enableSimpleMath: true,
        rememberSendChoice: false,
        lastSendChoice: null,
        serverFallback: true,
        maxApiCallsPerMinute: 60,
        debounceDelay: 500,
        debugMode: false
      };
      if (!this.settingsLoadPromise) {
        this.settingsLoadPromise = new Promise(async (resolve) => {
          const settings = await storageService.get(defaultSettings);
          this.settings = settings;
          // Apply to runtime
          if (settings.dpiInline) CONFIG.dpi.inline = settings.dpiInline;
          if (settings.dpiDisplay) CONFIG.dpi.display = settings.dpiDisplay;
          if (settings.renderServer) this.serverPreference = settings.renderServer;
          if (settings.maxApiCallsPerMinute) CONFIG.maxApiCallsPerMinute = settings.maxApiCallsPerMinute;
          if (settings.debounceDelay) {
            CONFIG.debounceDelay = settings.debounceDelay;
            CONFIG.renderDebounceDelay = settings.debounceDelay;
          }
          if (settings.debugMode) this.debugMode = !!settings.debugMode;
          // toggle modes
          this.naiveTexMode = !!settings.enableNaiveTeX;
          this.log(`Naive TeX mode ${this.naiveTexMode ? 'enabled' : 'disabled'}`);
          this.log('Settings loaded:', settings);
          resolve(settings);
        });
      }
      return this.settingsLoadPromise;
    },

    async getSettings() { if (!this.settings) await this.loadSettings(); return this.settings; }
  };

  // === Toggle State Management (strict boolean) ===
  function getToggleState(composeArea) {
    // Check DOM-based override first (works for tests and Gmail)
    const el = composeArea.closest('[data-tex-toggle]');
    if (el) return el.getAttribute('data-tex-toggle') !== 'off';
    
    // For file:// protocol, default to enabled for testing
    if (location.protocol === 'file:') {
      TeXForGmail.log('File protocol detected, defaulting toggle to ON');
      return true;
    }
    
    // Normal toggle state from Map
    if (!TeXForGmail.toggleStates.has(composeArea)) TeXForGmail.toggleStates.set(composeArea, false);
    return !!TeXForGmail.toggleStates.get(composeArea);
  }
  function setToggleState(composeArea, state) {
    TeXForGmail.toggleStates.set(composeArea, !!state);
    TeXForGmail.log(`Toggle state set to ${state ? 'active' : 'inactive'} for compose area`);
  }
  // Removed unused function cleanupToggleState - cleanup handled by performComprehensiveCleanup

  // === Button Visual State Management ===
  function updateButtonVisualState(button, isActive) {
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
    const parent = composeArea.closest('.M9, .AD, .aoI');
    if (parent) {
      const toolbar = parent.querySelector('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
      if (toolbar) return TeXForGmail.composeButtons.get(toolbar);
    }
    return null;
  }

  // === Robust restore function (reconstruct from wrappers first) ===
  function restoreLatexSource(composeArea) {
    if (!composeArea || !composeArea.isConnected) {
      TeXForGmail.log('Warning: Invalid compose area for restore operation');
      return false;
    }
    // First choice: reconstruct from current math wrappers/images
    const mathImgs = composeArea.querySelectorAll('.tex-math-inline img, .tex-math-display img');
    if (mathImgs.length > 0) {
      let restored = 0;
      mathImgs.forEach(img => {
        const source = img.getAttribute('data-original-source') || img.alt || extractSourceFromElement(img);
        if (!source) return;
        const wrapper = img.closest('.tex-math-inline, .tex-math-display') || img;
        const node = document.createTextNode(source);
        if (wrapper.parentNode) {
          wrapper.parentNode.replaceChild(node, wrapper);
          restored++;
        }
      });
      if (restored > 0) {
        composeArea.normalize();
        TeXForGmail.log(`Restored ${restored} LaTeX sources from current wrappers`);
        return true;
      }
    }
    // No wrappers → leave content as-is to avoid overwriting user edits.
    TeXForGmail.log('No math wrappers found; skipping snapshot restore to preserve edits');
    return false;
  }

  function rerenderAllLatex(composeArea) {
    const hasChanges = detectAndRenderLatex(composeArea);
    TeXForGmail.log(`Re-rendered LaTeX, changes: ${hasChanges}`);
    return hasChanges;
  }

  function toggleRendering(composeArea) {
    const currentState = getToggleState(composeArea);
    const newState = !currentState;
    TeXForGmail.log(`Toggle: current=${currentState}, new=${newState}`);
    setToggleState(composeArea, newState);
    const button = getButtonForComposeArea(composeArea);
    if (button) updateButtonVisualState(button, newState);

    if (newState) {
      const currentContent = composeArea.innerHTML;
      const currentTextContent = composeArea.textContent || '';
      if (!TeXForGmail.originalContent.has(composeArea)) {
        TeXForGmail.log(`Saving ORIGINAL content snapshot (first enable) - ${currentContent.length} chars HTML`);
        TeXForGmail.originalContent.set(composeArea, currentContent);
      } else {
        TeXForGmail.log('Using existing saved snapshot (not overwriting)');
      }
      setupAutoRenderObserver(composeArea);
      const hasLatexSource =
        /\$\$[\s\S]*?\$\$/.test(currentTextContent) ||
        (/(?<!\$)\$([^\$\n]+?)\$/.test(currentTextContent) && !isCurrency(currentTextContent)) ||
        /\\\[([\s\S]*?)\\\]/.test(currentTextContent) ||
        /\\\(([\s\S]*?)\\\)/.test(currentTextContent);
      if (hasLatexSource) {
        preserveCursorPosition(composeArea, () => { rerenderAllLatex(composeArea); });
      }
      showToast('LaTeX rendering ON');
    } else {
      const observer = TeXForGmail.composeObservers.get(composeArea);
      if (observer) { observer.disconnect(); TeXForGmail.composeObservers.delete(composeArea); TeXForGmail.log('Observer disconnected - toggle OFF'); }
      TeXForGmail.log(`Before restore: ${composeArea.innerHTML.length} chars HTML`);
      const restored = restoreLatexSource(composeArea);
      TeXForGmail.log(`After restore: ${composeArea.innerHTML.length} chars HTML`);
      if (restored && (composeArea.textContent || '').trim()) showToast('LaTeX source restored');
      else showToast('LaTeX rendering OFF');
    }
    return newState;
  }

  // === LaTeX Pattern Detection (compiled once) ===
  const LATEX_PATTERNS = {
    // Display math: $$...$$ (allow multiline, non-greedy)
    display: /\$\$([\s\S]*?)\$\$/g,
    // Display math: \[...\]
    displayBracket: /\\\[([\s\S]*?)\\\]/g,
    // Inline math: $...$ (no nested $)
    inline: /(?<!\$)\$([^\$\n]+?)\$/g,
    // Inline math: \(...\)
    inlineParenthesis: /\\\(([\s\S]*?)\\\)/g,
    // Escaped dollar signs (handled via placeholder)
    escaped: /\\\$/g
  };

  // LaTeX validation to prevent injection attacks
  function isValidLatex(latex) {
    if (latex.length >= CONFIG.maxLatexLength) return false;
    // Basic validation - no script tags or suspicious patterns
    const dangerous = /<script|javascript:|on\w+=/i;
    return !dangerous.test(latex);
  }

  // Currency patterns compiled once for performance
  const CURRENCY_PATTERNS = [
    /\$\d+(?:[,.\d]*)?(?:\s+(?:and|to|-|\+|or)\s+\$\d+(?:[,.\d]*)?)?/,
    /\$\d+(?:[,.\d]*)?\/(?:hr|hour|day|week|month|year)/i,
    /(?:USD|EUR|GBP|CAD|AUD|JPY|CNY|INR)\s*\$?\d+/i,
    /\$\d+\.\d{2}(?:\s|$)/,
    /\$\d{1,3}(?:,\d{3})+/,
    /\$\d+\.?\d*(?:\s*(?:billion|million|thousand|hundred|k|K|M|B))?/i,
    /\$\d+(?:\.\d{1,2})?(?:\s*[-–]\s*\$?\d+(?:\.\d{1,2})?)?/,
    /(?:€|£|¥|₹|¢)\d+/,
    /\$\d+(?:\.\d{2})?\s*(?:each|per|\/)/i,
    /\$\d+\s*x\s*\d+/,
    /\$\d+(?:\.\d{2})?\s+(?:off|discount|savings?|rebate)/i
  ];
  function isCurrency(text) {
    if (!/\$\d/.test(text)) return false;
    const hasMathOperators = /[\+\-\*\/\=\^_\\]/.test(text);
    const hasOnlyPricePattern = /^\$\d+(?:\.\d{2})?$/.test(text.trim());
    if (hasOnlyPricePattern) return true;
    if (hasMathOperators) return CURRENCY_PATTERNS.slice(0, 6).some(p => p.test(text));
    return CURRENCY_PATTERNS.some(p => p.test(text));
  }

  // === Abbreviation expansion ===
  // Safe abbreviation patterns that require braces to avoid collisions with standard LaTeX commands
  const ABBREVIATION_PATTERNS_SAFE = [
    { regex: /\\bb\{([^}]+)\}/g, replacement: '\\mathbb{$1}' },
    { regex: /\\bf\{([^}]+)\}/g, replacement: '\\mathbf{$1}' },
    { regex: /\\cal\{([^}]+)\}/g, replacement: '\\mathcal{$1}' },
    { regex: /\\frak\{([^}]+)\}/g, replacement: '\\mathfrak{$1}' },
    { regex: /\\tilde\{([^}]+)\}/g, replacement: '\\widetilde{$1}' },
    { regex: /\\bar\{([^}]+)\}/g, replacement: '\\overline{$1}' },
    { regex: /\\uline\{([^}]+)\}/g, replacement: '\\underline{$1}' }
  ];
  function expandAbbreviations(latex) {
    // Only expand if enabled in settings to prevent LaTeX command corruption
    if (!TeXForGmail.settings?.enableAbbreviations) return latex;
    let expanded = latex;
    for (const pattern of ABBREVIATION_PATTERNS_SAFE) {
      expanded = expanded.replace(pattern.regex, pattern.replacement);
    }
    return expanded;
  }

  // === Theorem environment support ===
  // Removed unused function detectTheoremEnvironments - theorem detection integrated in main render
  function createTheoremWrapper(envType, colorArg, content) {
    if (!content || content.length > CONFIG.maxLatexLength) { TeXForGmail.log('Theorem content too long/empty, skipping'); return null; }
    const THEOREM_COLORS = { red:'#ffe6e6', blue:'#e6f3ff', green:'#e6ffe6', gray:'#f0f0f0', yellow:'#fff9e6' };
    const BORDER_COLORS = { '#ffe6e6':'#ff9999', '#e6f3ff':'#99ccff', '#e6ffe6':'#99ff99', '#f0f0f0':'#999999', '#fff9e6':'#f0b429' };
    const color = THEOREM_COLORS[colorArg] || THEOREM_COLORS.yellow;
    const wrapper = document.createElement('div');
    wrapper.className = 'tex-theorem-env';
    wrapper.setAttribute('data-theorem-type', envType);
    wrapper.style.cssText = `
      background-color:${color}; border-left:4px solid ${BORDER_COLORS[color] || '#999'};
      padding:10px; margin:10px 0; border-radius:4px;`;
    const title = document.createElement('strong');
    title.textContent = `${envType.charAt(0).toUpperCase()+envType.slice(1)}: `;
    title.style.cssText = 'display:block;margin-bottom:5px;';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'tex-theorem-content';
    contentDiv.textContent = content.trim();
    wrapper.appendChild(title); wrapper.appendChild(contentDiv);
    return wrapper;
  }

  // === Render Server URLs / Health ===
  function getCodeCogsUrl(latex, isDisplay) {
    latex = expandAbbreviations(latex);
    if (!isValidLatex(latex)) { TeXForGmail.log('Invalid/dangerous LaTeX:', latex); return null; }
    if (!TeXForGmail.checkRateLimit()) { TeXForGmail.log('Rate limit exceeded, skipping render'); return null; }
    
    // Properly encode LaTeX with DPI settings
    // IMPORTANT: Don't use template literals with backslashes to avoid escape issues
    const dpi = isDisplay ? CONFIG.dpi.display : CONFIG.dpi.inline;
    const displayPrefix = isDisplay ? '\\displaystyle ' : '';
    
    // Build the full LaTeX command string carefully to preserve backslashes
    const dpiCommand = '\\dpi{' + dpi + '} ';
    const fullLatex = dpiCommand + displayPrefix + latex.trim();
    
    // Encode the entire LaTeX command
    const encoded = encodeURIComponent(fullLatex);
    return `https://latex.codecogs.com/png.image?${encoded}`;
  }
  function getWordPressUrl(latex, isDisplay = false) {
    // Apply rate limiting to WordPress as well
    if (!TeXForGmail.checkRateLimit()) {
      TeXForGmail.log('WordPress rate limit exceeded');
      return null;
    }
    latex = expandAbbreviations(latex);
    const full = (isDisplay ? '\\displaystyle ' : '') + latex.trim();
    const dpi = isDisplay ? CONFIG.dpi.display : CONFIG.dpi.inline;
    const s = Math.max(0, Math.min(4, Math.round(dpi / 100))); // WP supports 0..4
    const encoded = encodeURIComponent(full);
    return `https://s0.wp.com/latex.php?latex=${encoded}&bg=ffffff&fg=000000&s=${s}`;
  }

  const ServerHealth = { 
    codecogs: { failures: 0, lastCheck: 0, consecutiveFailures: 0 }, 
    wordpress: { failures: 0, lastCheck: 0, consecutiveFailures: 0 }, 
    resetThreshold: 300000, // 5 minutes
    maxFailures: 3,
    getUserMessage() {
      const bothDown = this.codecogs.consecutiveFailures >= 2 && this.wordpress.consecutiveFailures >= 2;
      const codeCogsDown = this.codecogs.consecutiveFailures >= 2;
      const wpDown = this.wordpress.consecutiveFailures >= 2;
      
      if (bothDown) {
        return 'Math servers temporarily unavailable. Enable Simple Math in settings for offline rendering.';
      } else if (codeCogsDown) {
        return 'Primary math server slow. Switching to backup...';
      } else if (wpDown) {
        return 'Backup server issues detected. Using primary server...';
      }
      return null;
    },
    recordSuccess(server) {
      if (this[server]) {
        this[server].consecutiveFailures = 0;
        this[server].failures = Math.max(0, this[server].failures - 1);
      }
    },
    recordFailure(server) {
      if (this[server]) {
        this[server].failures++;
        this[server].consecutiveFailures++;
        this[server].lastCheck = Date.now();
      }
    }
  };
  function checkServerHealth(server) {
    const now = Date.now();
    const health = ServerHealth[server];
    if (now - health.lastCheck > ServerHealth.resetThreshold) health.failures = 0;
    health.lastCheck = now;
    return health.failures < ServerHealth.maxFailures;
  }
  function switchServerSafely(newServer, reason = '') {
    if (TeXForGmail.serverSwitchMutex) { TeXForGmail.log('Server switch already in progress, skipping'); return false; }
    const now = Date.now();
    if (now - TeXForGmail.serverSwitchTimestamp < 5000) { TeXForGmail.log('Server switch attempted too soon, skipping'); return false; }
    TeXForGmail.serverSwitchMutex = true;
    TeXForGmail.serverSwitchTimestamp = now;
    try {
      if (TeXForGmail.serverPreference === newServer) { TeXForGmail.log('Server already set to', newServer); return false; }
      TeXForGmail.serverPreference = newServer;
      try { sessionStorage.setItem('tex-gmail-server-preference', newServer); } catch (_) { TeXForGmail.log('Could not save server preference to sessionStorage'); }
      TeXForGmail.log(`Server switched to ${newServer}${reason ? ': '+reason : ''}`);
      showToast(newServer === 'wordpress' ? 'Switching to backup math server...' : 'Switching to primary math server...', 'info');
      return true;
    } finally {
      setTimeout(() => { TeXForGmail.serverSwitchMutex = false; }, 100);
    }
  }

  // === Simple Math Mode (DOM) ===
  function sanitizeForHTML(text) {
    const escapeMap = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;',
      '(':'&#40;',')':'&#41;','[':'&#91;',']':'&#93;','{':'&#123;','}':'&#125;','\\':'&#92;','|':'&#124;','*':'&#42;','+':'&#43;','?':'&#63;','.' :'&#46;','^':'&#94;','$':'&#36;' };
    return text.replace(/[&<>"'\/`=()[\]{}\\|*+?.^$]/g, ch => escapeMap[ch]);
  }
  function createSafeElement(tag, content, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content) el.textContent = content;
    return el;
  }
  function renderSimpleMath(latex, isDisplay, opts = {}) {
    latex = expandAbbreviations(latex);
    const greekLetters = {
      '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\epsilon':'ε','\\zeta':'ζ','\\eta':'η','\\theta':'θ','\\iota':'ι','\\kappa':'κ','\\lambda':'λ','\\mu':'μ','\\nu':'ν','\\xi':'ξ','\\pi':'π','\\rho':'ρ','\\sigma':'σ','\\tau':'τ','\\upsilon':'υ','\\phi':'φ','\\chi':'χ','\\psi':'ψ','\\omega':'ω',
      '\\Alpha':'Α','\\Beta':'Β','\\Gamma':'Γ','\\Delta':'Δ','\\Epsilon':'Ε','\\Zeta':'Ζ','\\Eta':'Η','\\Theta':'Θ','\\Iota':'Ι','\\Kappa':'Κ','\\Lambda':'Λ','\\Mu':'Μ','\\Nu':'Ν','\\Xi':'Ξ','\\Pi':'Π','\\Rho':'Ρ','\\Sigma':'Σ','\\Tau':'Τ','\\Upsilon':'Υ','\\Phi':'Φ','\\Chi':'Χ','\\Psi':'Ψ','\\Omega':'Ω',
      '\\sum':'∑','\\int':'∫','\\prod':'∏','\\sqrt':'√','\\infty':'∞','\\partial':'∂','\\nabla':'∇','\\pm':'±','\\times':'×','\\div':'÷','\\cdot':'·','\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈','\\equiv':'≡','\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃','\\cup':'∪','\\cap':'∩','\\emptyset':'∅','\\forall':'∀','\\exists':'∃','\\rightarrow':'→','\\leftarrow':'←','\\Rightarrow':'⇒','\\Leftarrow':'⇐','\\leftrightarrow':'↔'
    };
    try {
      const wrapper = document.createElement('span');
      wrapper.className = isDisplay ? 'tex-math-display' : 'tex-math-inline';
      wrapper.setAttribute('data-latex', latex);
      wrapper.setAttribute('data-display', isDisplay ? 'block' : 'inline');
      wrapper.setAttribute('data-render-mode', 'simple');
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('aria-label', 'Math. Press Tab for Copy, or open menu with Shift+F10.');
      if (isDisplay) { wrapper.style.display = 'block'; wrapper.style.textAlign = 'center'; wrapper.style.margin = '1em 0'; }
      else { wrapper.style.display = 'inline-block'; wrapper.style.verticalAlign = 'middle'; }
      let processedLatex = latex;
      for (const [tex, sym] of Object.entries(greekLetters)) {
        const regex = new RegExp(tex.replace(/\\/g, '\\\\'), 'g'); processedLatex = processedLatex.replace(regex, sym);
      }
      const container = document.createElement('span');
      const settings = TeXForGmail.settings || {};
      const isRead = !!opts.isReadMode;
      container.style.fontFamily = isRead
        ? (settings.simpleMathFontIncoming || 'serif')
        : (settings.simpleMathFontOutgoing || 'serif');
      container.style.fontSize = isDisplay ? '1.2em' : '1em';
      if (!isDisplay) container.style.verticalAlign = 'middle';
      const parts = [];
      let currentText = '';
      let i = 0;
      while (i < processedLatex.length) {
        const ch = processedLatex[i];
        if (ch === '^' || ch === '_') {
          const type = ch === '^' ? 'sup' : 'sub';
          if (currentText) { parts.push({ type: 'text', content: currentText }); currentText = ''; }
          i++;
          let content = '';
          if (processedLatex[i] === '{') {
            i++; let depth = 1;
            while (i < processedLatex.length && depth > 0) {
              if (processedLatex[i] === '{') depth++;
              else if (processedLatex[i] === '}') depth--;
              if (depth > 0) content += processedLatex[i];
              i++;
            }
          } else {
            content = processedLatex[i] || '';
            i++;
          }
          parts.push({ type, content });
        } else {
          currentText += ch; i++;
        }
      }
      if (currentText) parts.push({ type: 'text', content: currentText });
      parts.forEach(p => {
        if (p.type === 'text') container.appendChild(document.createTextNode(p.content));
        if (p.type === 'sup') container.appendChild(createSafeElement('sup', p.content));
        if (p.type === 'sub') container.appendChild(createSafeElement('sub', p.content));
      });
      wrapper.appendChild(container);
      return wrapper;
    } catch (error) {
      TeXForGmail.log('Error in renderSimpleMath:', error);
      return null;
    }
  }

  // === Naive TeX detection ===
  function detectNaiveTeX(text) {
    const patterns = [
      /\b([a-zA-Z])\^(\{[^}]+\}|\w+)/g,
      /\b([a-zA-Z])_(\{[^}]+\}|\w+)/g,
      /\be\^\(([^)]+)\)/g,
      /\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|Alpha|Beta|Gamma|Delta|Epsilon|Theta|Lambda|Mu|Pi|Sigma|Omega)/g,
      /\b\d+\/\d+\b/g,
      /\b([a-zA-Z])_\d+\^\d+/g
    ];
    const currencyPattern = /\$[\d,]+\.?\d*/g;
    const urlPattern = /https?:\/\/|www\.|\/\w+\.\w+/gi;
    if (currencyPattern.test(text) || urlPattern.test(text)) return null;
    for (const p of patterns) if (p.test(text)) return text;
    return null;
  }

  // === Create wrapper element for rendered math ===
  function createMathWrapper(latex, isDisplay, imgUrl) {
    const wrapper = document.createElement('span');
    wrapper.className = isDisplay ? 'tex-math-display' : 'tex-math-inline';
    wrapper.setAttribute('data-latex', latex);
    wrapper.setAttribute('data-processed', 'true');
    wrapper.setAttribute('data-tex-toggled', 'rendered');
    if (isDisplay) { wrapper.style.display = 'block'; wrapper.style.textAlign = 'center'; wrapper.style.margin = '1em 0'; }
    else { wrapper.style.display = 'inline-block'; wrapper.style.verticalAlign = 'middle'; }
    
    // Add loading indicator
    const loadingIndicator = document.createElement('span');
    loadingIndicator.style.cssText = 'display: inline-block; width: 20px; height: 20px; border: 2px solid #ccc; border-top-color: #333; border-radius: 50%; animation: tex-spin 0.8s linear infinite;';
    loadingIndicator.setAttribute('aria-label', 'Loading LaTeX...');
    wrapper.appendChild(loadingIndicator);
    
    // Add CSS animation if not already present
    if (!document.querySelector('#tex-loading-styles')) {
      const style = document.createElement('style');
      style.id = 'tex-loading-styles';
      style.textContent = '@keyframes tex-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    
    const img = document.createElement('img');
    img.src = imgUrl || '';
    img.alt = isDisplay ? `$$${latex}$$` : `$${latex}$`;
    img.title = `LaTeX: ${img.alt}`;
    if ('dataset' in img) {
      img.setAttribute('data-latex', latex);
      img.setAttribute('data-display', isDisplay ? 'block' : 'inline');
      img.setAttribute('data-timestamp', Date.now().toString());
      img.setAttribute('data-version', '1.0.0');
    } else {
      img.setAttribute('tex-latex', latex);
      img.setAttribute('tex-display', isDisplay ? 'block' : 'inline');
      TeXForGmail.log('Using fallback attributes - dataset not supported');
    }
    img.className = 'tex-rendered';
    img.contentEditable = false;
    if (isDisplay) { img.style.display = 'inline-block'; img.style.maxWidth = '100%'; }
    else { img.style.verticalAlign = 'middle'; img.style.display = 'inline'; }
    img.style.cursor = 'pointer';
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Click to edit LaTeX source');
    img.setAttribute('tabindex', '0');
    img.setAttribute('data-original-source', isDisplay ? `$$${latex}$$` : `$${latex}$`);

    // Enhanced error handling with retry and fallback
    let retryCount = 0;
    const maxRetries = 2;
    
    img.onload = function() {
      // Remove loading indicator on successful load
      if (loadingIndicator && loadingIndicator.parentNode === wrapper) {
        wrapper.removeChild(loadingIndicator);
      }
      // Reset server health on success
      if ((img.src || '').includes('codecogs.com')) ServerHealth.recordSuccess('codecogs');
      else if ((img.src || '').includes('wp.com')) ServerHealth.recordSuccess('wordpress');
    };
    
    img.onerror = function() {
      const settings = TeXForGmail.settings || {};
      const fallbackAllowed = settings.serverFallback !== false;
      const isFromCodecogs = (img.src || '').includes('codecogs.com');
      const isFromWP = (img.src || '').includes('wp.com');

      // First, try retry with same server using exponential backoff
      if (retryCount < maxRetries && !img.hasAttribute('data-retry-exhausted')) {
        retryCount++;
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 8000); // 1s, 2s, 4s, max 8s
        TeXForGmail.log(`Retrying LaTeX render, attempt ${retryCount}/${maxRetries} (waiting ${backoffMs}ms)`);
        
        // Show user-friendly message on first retry only
        if (retryCount === 1) {
          showToast('Math server slow, retrying...', 'info');
        }
        
        setTimeout(() => {
          // Add timestamp to force cache bypass
          const separator = img.src.includes('?') ? '&' : '?';
          img.src = img.src.replace(/[?&]retry=\d+/, '') + separator + 'retry=' + Date.now();
        }, backoffMs);
        return;
      }
      
      img.setAttribute('data-retry-exhausted', 'true');
      
      if (isFromCodecogs) ServerHealth.recordFailure('codecogs');
      else if (isFromWP) ServerHealth.recordFailure('wordpress');
      
      // Show helpful message if servers are having issues
      const healthMsg = ServerHealth.getUserMessage();
      if (healthMsg && retryCount === maxRetries) {
        showToast(healthMsg, 'warning');
      }

      // Try one-time fallback to the other server before giving up
      if (fallbackAllowed && !img.getAttribute('data-fallback-attempted')) {
        let fallbackUrl = null;
        if (isFromCodecogs) fallbackUrl = getWordPressUrl(latex, isDisplay);
        else fallbackUrl = getCodeCogsUrl(latex, isDisplay);
        if (fallbackUrl) {
          img.setAttribute('data-fallback-attempted', '1');
          TeXForGmail.log('Attempting fallback server for LaTeX image');
          showToast('Switching to backup math server...', 'info');
          img.src = fallbackUrl;
          // also flip preference for future if many failures
          if (isFromCodecogs && ServerHealth.codecogs.failures >= ServerHealth.maxFailures) switchServerSafely('wordpress', 'CodeCogs failures');
          if (isFromWP && ServerHealth.wordpress.failures >= ServerHealth.maxFailures) switchServerSafely('codecogs', 'WordPress failures');
          return;
        }
      }
      // If still failing, try Simple Math as last resort
      if (settings.enableSimpleMath !== false) { // Default to true for better UX
        TeXForGmail.log('All image servers failed, attempting Simple Math fallback');
        const simpleMathElement = renderSimpleMath(latex, isDisplay, { isReadMode: false });
        if (simpleMathElement) {
          // Replace the failed image wrapper with Simple Math
          wrapper.parentNode.replaceChild(simpleMathElement, wrapper);
          // More informative message based on failure reason
          const errorMsg = (isFromCodecogs && ServerHealth.codecogs.failures > 2) ? 
            'Math servers unavailable, using offline rendering' : 
            'Using offline math rendering (faster & private)';
          showToast(errorMsg, 'info');
          return;
        }
      }
      
      // If everything failed, show source and remove loading indicator
      if (loadingIndicator && loadingIndicator.parentNode === wrapper) {
        wrapper.removeChild(loadingIndicator);
      }
      const sourceText = isDisplay ? `$$${latex}$$` : `$${latex}$`;
      wrapper.textContent = sourceText;
      wrapper.classList.add('tex-render-error');
      wrapper.setAttribute('title', 'Failed to render LaTeX - click to copy source');
      wrapper.setAttribute('data-tex-source', sourceText);
      wrapper.style.cursor = 'pointer';
      
      // Provide actionable error message
      const errorDetail = (ServerHealth.codecogs.failures >= ServerHealth.maxFailures && 
                          ServerHealth.wordpress.failures >= ServerHealth.maxFailures) ?
        'Math servers unreachable. Check internet connection or enable Simple Math in settings.' :
        'Unable to render equation. Showing LaTeX source (click to copy).';
      
      try { showToast(errorDetail, 'error'); } catch (_) {}
      
      // Add click-to-copy functionality for failed renders
      wrapper.onclick = async () => {
        try {
          await copyTextToClipboard(sourceText);
          showToast('LaTeX source copied', 'info');
        } catch (_) {
          showToast('Could not copy to clipboard', 'error');
        }
      };
      
      try { if (typeof localStorage !== 'undefined' && img.src) localStorage.setItem(`tex_${img.src}`, sourceText); } catch (_) {}
    };
    
    img.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.buttons !== 0 && e.buttons !== 1) return;
      TeXForGmail.handleImageClick(this);
    });
    wrapper.appendChild(img);
    return wrapper;
  }

  // Click-to-edit handler
  TeXForGmail.handleImageClick = function(img) {
    const wrapper = img.parentElement;
    const sourceText = img.getAttribute('data-original-source');
    if (!sourceText) { TeXForGmail.log('Click-to-edit: No source text found'); return; }
    const textNode = document.createTextNode(sourceText);
    wrapper.parentNode.replaceChild(textNode, wrapper);
    const range = document.createRange();
    const delimLength = sourceText.startsWith('$$') ? 2 : 1;
    range.setStart(textNode, delimLength);
    range.setEnd(textNode, delimLength);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    const composeArea = textNode.parentElement;
    if (composeArea && composeArea.focus) composeArea.focus();
    TeXForGmail.log('Click-to-edit: Restored source text', sourceText);
  };

  // Insert LaTeX template at cursor position (Range API, no execCommand)
  TeXForGmail.insertTexTemplate = function(template) {
    const sel = window.getSelection(); if (!sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const composeArea = this.getActiveTarget();
    if (!composeArea) { TeXForGmail.log('Template insertion: Not in compose area'); return false; }
    const cursorPos = template.indexOf('|');
    const cleanTemplate = template.replace(/\|/g, '');
    // Insert text node
    range.deleteContents();
    const node = document.createTextNode(cleanTemplate);
    range.insertNode(node);
    // Move caret
    const newRange = document.createRange();
    const offset = cursorPos >= 0 ? cursorPos : cleanTemplate.length;
    newRange.setStart(node, Math.min(offset, node.textContent.length));
    newRange.setEnd(node, Math.min(offset, node.textContent.length));
    sel.removeAllRanges(); sel.addRange(newRange);
    return true;
  };

  // Navigate between template placeholders
  TeXForGmail.navigateTemplate = function(direction) {
    const selection = window.getSelection(); if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    const text = container.textContent; const currentPos = range.startOffset;
    const placeholders = [];
    let braceDepth = 0; let placeholderStart = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') { if (braceDepth === 0) placeholderStart = i; braceDepth++; }
      else if (text[i] === '}') { braceDepth--; if (braceDepth === 0 && placeholderStart >= 0) { if (i - placeholderStart === 1) placeholders.push({ start: placeholderStart + 1, end: i }); placeholderStart = -1; } }
    }
    if (placeholders.length === 0) return;
    let target;
    if (direction === 'next') { target = placeholders.find(p => p.start > currentPos) || placeholders[0]; }
    else { target = [...placeholders].reverse().find(p => p.start < currentPos) || placeholders[placeholders.length - 1]; }
    if (target) {
      const newRange = document.createRange();
      newRange.setStart(container, target.start); newRange.setEnd(container, target.end);
      selection.removeAllRanges(); selection.addRange(newRange);
    }
  };

  // Extract LaTeX source from element with multiple fallbacks
  function extractSourceFromElement(element) {
    if (!element) { TeXForGmail.log('extractSourceFromElement: null element'); return '[LaTeX source lost]'; }
    if (element.dataset?.latex) {
      const display = element.dataset.display === 'block' ? '$$' : '$'; return `${display}${element.dataset.latex}${display}`;
    }
    if (element.alt) return element.alt;
    if (element.getAttribute) {
      const texLatex = element.getAttribute('tex-latex');
      if (texLatex) {
        const texDisplay = element.getAttribute('tex-display');
        const display = texDisplay === 'block' ? '$$' : '$'; return `${display}${texLatex}${display}`;
      }
    }
    if (element.title?.startsWith('LaTeX: ')) return element.title.substring(7);
    try {
      if (typeof localStorage !== 'undefined' && element.src) {
        const cached = localStorage.getItem(`tex_${element.src}`);
        if (cached) { TeXForGmail.log('Source recovered from localStorage cache'); return cached; }
      }
    } catch (_) { TeXForGmail.log('localStorage not available for source extraction'); }
    TeXForGmail.log('WARNING: LaTeX source could not be extracted from element');
    return '[LaTeX source lost]';
  }

  // === Improved cursor preservation using temporary markers ===
  function preserveCursorPosition(composeArea, callback) {
    const sel = window.getSelection();
    let hadFocus = composeArea.contains(document.activeElement) || composeArea === document.activeElement;
    let collapsed = true;
    let startMarker = null, endMarker = null;

    if (sel.rangeCount > 0 && hadFocus) {
      const range = sel.getRangeAt(0);
      if (composeArea.contains(range.startContainer) && composeArea.contains(range.endContainer)) {
        collapsed = range.collapsed;
        startMarker = document.createElement('span');
        startMarker.setAttribute('data-tex-caret', 'start');
        startMarker.style.display = 'inline-block'; startMarker.style.width = '0'; startMarker.style.height = '0'; startMarker.style.overflow = 'hidden';
        range.insertNode(startMarker);
        if (!collapsed) {
          const endRange = range.cloneRange();
          endRange.collapse(false);
          endMarker = document.createElement('span');
          endMarker.setAttribute('data-tex-caret', 'end');
          endMarker.style.display = 'inline-block'; endMarker.style.width = '0'; endMarker.style.height = '0'; endMarker.style.overflow = 'hidden';
          endRange.insertNode(endMarker);
        }
      }
    }

    const result = callback();

    // Restore selection
    try {
      const newRange = document.createRange();
      const s = composeArea.querySelector('span[data-tex-caret="start"]');
      const e = composeArea.querySelector('span[data-tex-caret="end"]');
      if (s) {
        newRange.setStartBefore(s);
        if (e) newRange.setEndBefore(e); else newRange.collapse(true);
        sel.removeAllRanges(); sel.addRange(newRange);
      }
      // cleanup markers
      if (s && s.parentNode) s.parentNode.removeChild(s);
      if (e && e.parentNode) e.parentNode.removeChild(e);
      if (document.activeElement !== composeArea) { try { composeArea.focus(); } catch (_) {} }
    } catch (err) {
      TeXForGmail.log('Could not restore cursor position:', err);
      if (document.activeElement !== composeArea) { try { composeArea.focus(); } catch (_) {} }
    }
    return result;
  }

  // === Main rendering function ===
  function detectAndRenderLatex(rootElement, options = {}) {
    // Allow call without explicit target by detecting compose area
    if (!rootElement) { rootElement = findComposeArea(); if (!rootElement) return false; }
    const { oneTimeRender = false, isReadMode = false } = options;
    if (!oneTimeRender && !getToggleState(rootElement)) { TeXForGmail.log('Rendering disabled by toggle, skipping'); return false; }
    if (!isReadMode && rootElement.getAttribute('data-tex-processing') === 'true') { TeXForGmail.log('Already processing this area, skipping'); return false; }
    rootElement.setAttribute('data-tex-processing', 'true');
    if (isReadMode && !TeXForGmail.originalContent.has(rootElement)) {
      TeXForGmail.originalContent.set(rootElement, rootElement.innerHTML);
      TeXForGmail.log('Stored original content for read mode');
    }
    try {
      const textNodes = findTextNodes(rootElement);
      let hasChanges = false;

      textNodes.forEach(textNode => {
        if (textNode.parentNode?.getAttribute('data-tex-processing-node') === 'true') return;
        let text = textNode.textContent;

        // Mask escaped dollar signs with a unique placeholder
        const ESCAPED_DOLLAR_PLACEHOLDER = '__ESCAPED_DOLLAR_' + Math.random().toString(36).slice(2) + '__';
        const hasEscapedDollar = text.includes('\\$');
        if (hasEscapedDollar) text = text.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

        const parent = textNode.parentNode;

        // 1) Theorem environments (preserve surrounding text)
        const ENVIRONMENTS = ['theorem', 'lemma', 'proposition', 'corollary', 'definition'];
        const envRegex = new RegExp(`\\\\begin\\{(${ENVIRONMENTS.join('|')})\\}(?:\\[([^\\]]+)\\])?([\\s\\S]*?)\\\\end\\{\\1\\}`, 'g');
        if (envRegex.test(text)) {
          envRegex.lastIndex = 0;
          let m, last = 0;
          const frag = document.createDocumentFragment();
          while ((m = envRegex.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.substring(last, m.index).replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$')));
            const el = createTheoremWrapper(m[1], m[2], m[3]);
            if (el) {
              frag.appendChild(el);
              const contentDiv = el.querySelector('.tex-theorem-content');
              if (contentDiv) detectAndRenderLatex(contentDiv, { oneTimeRender: true });
            }
            last = m.index + m[0].length;
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.substring(last).replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$')));
          parent.setAttribute('data-tex-processing-node', 'true');
          parent.insertBefore(frag, textNode);
          parent.removeChild(textNode);
          parent.removeAttribute('data-tex-processing-node');
          hasChanges = true;
          return; // continue next text node
        }

        // 2) Display and inline math matches (collect)
        const matches = [];
        let match;

        // $$...$$
        LATEX_PATTERNS.display.lastIndex = 0;
        while ((match = LATEX_PATTERNS.display.exec(text)) !== null) {
          matches.push({ type: 'display', start: match.index, end: match.index + match[0].length, latex: (match[1] || '').trim(), full: match[0] });
        }
        // \[...\]
        LATEX_PATTERNS.displayBracket.lastIndex = 0;
        while ((match = LATEX_PATTERNS.displayBracket.exec(text)) !== null) {
          matches.push({ type: 'display', start: match.index, end: match.index + match[0].length, latex: (match[1] || '').trim(), full: match[0] });
        }
        // $...$
        LATEX_PATTERNS.inline.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inline.exec(text)) !== null) {
          // avoid overlapping display
          let overlaps = false;
          for (const d of matches) if (d.type === 'display' && match.index >= d.start && match.index < d.end) { overlaps = true; break; }
          if (!overlaps) {
            const full = match[0];
            if (isCurrency(full)) { continue; } // per-match currency filter
            matches.push({ type: 'inline', start: match.index, end: match.index + match[0].length, latex: (match[1] || '').trim(), full });
          }
        }
        // \(...\)
        LATEX_PATTERNS.inlineParenthesis.lastIndex = 0;
        while ((match = LATEX_PATTERNS.inlineParenthesis.exec(text)) !== null) {
          let overlaps = false;
          for (const ex of matches) if (match.index >= ex.start && match.index < ex.end) { overlaps = true; break; }
          if (!overlaps) matches.push({ type: 'inline', start: match.index, end: match.index + match[0].length, latex: (match[1] || '').trim(), full: match[0] });
        }

        // 3) Naive TeX (if enabled) and no formal matches
        if (TeXForGmail.naiveTexMode && matches.length === 0) {
          const naiveText = detectNaiveTeX(text);
          if (naiveText) {
            const naivePatterns = [ /\b([a-zA-Z])\^(\{[^}]+\}|\w+)/g, /\b([a-zA-Z])_(\{[^}]+\}|\w+)/g, /\be\^\(([^)]+)\)/g ];
            for (const p of naivePatterns) {
              p.lastIndex = 0;
              while ((match = p.exec(text)) !== null) {
                const naive = match[0];
                matches.push({ type: 'inline', start: match.index, end: match.index + match[0].length, latex: naive, full: naive, isNaive: true });
              }
            }
          }
        }

        // Nothing matched: possibly restore escaped dollars
        if (matches.length === 0) {
          if (hasEscapedDollar) {
            const restored = text.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$');
            if (restored !== textNode.textContent) { textNode.textContent = restored; hasChanges = true; }
          }
          return;
        }

        // Sort matches and build replacement fragment
        matches.sort((a, b) => a.start - b.start);
        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        const restoreEscaped = str => hasEscapedDollar ? str.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$') : str;

        for (const m of matches) {
          if (m.start > lastIndex) frag.appendChild(document.createTextNode(restoreEscaped(text.substring(lastIndex, m.start))));
          let mathElement = null;
          // Choose rendering mode
          if ((m.isNaive || TeXForGmail.simpleMode) && (TeXForGmail.settings?.enableSimpleMath)) {
            mathElement = renderSimpleMath(m.latex, m.type === 'display', opts);
          } else {
            // Image-based render with enhanced fallback
            let imgUrl = null;
            let fallbackUsed = false;
            
            // Try primary server
            if (TeXForGmail.serverPreference === 'codecogs' && checkServerHealth('codecogs')) {
              imgUrl = getCodeCogsUrl(m.latex, m.type === 'display');
            } else if (TeXForGmail.serverPreference === 'wordpress' && checkServerHealth('wordpress')) {
              imgUrl = getWordPressUrl(m.latex, m.type === 'display');
            }
            
            // If primary server failed, try alternate server
            if (!imgUrl && TeXForGmail.settings?.serverFallback !== false) {
              if (TeXForGmail.serverPreference === 'codecogs' && checkServerHealth('wordpress')) {
                imgUrl = getWordPressUrl(m.latex, m.type === 'display');
                fallbackUsed = true;
              } else if (TeXForGmail.serverPreference === 'wordpress' && checkServerHealth('codecogs')) {
                imgUrl = getCodeCogsUrl(m.latex, m.type === 'display');
                fallbackUsed = true;
              }
            }
            
            // If still no URL (rate-limited or validation failed), use Simple Math fallback
            if (!imgUrl && TeXForGmail.settings?.enableSimpleMath) {
              mathElement = renderSimpleMath(m.latex, m.type === 'display', opts);
              if (mathElement) {
                TeXForGmail.log('Using Simple Math fallback due to server unavailability');
                // Only show toast occasionally to avoid spam
                if (Math.random() < 0.1) showToast('Using offline math rendering', 'info');
              }
            }
            
            // Create image wrapper if we have a URL
            if (!mathElement && imgUrl) {
              mathElement = createMathWrapper(m.latex, m.type === 'display', imgUrl);
              if (fallbackUsed && Math.random() < 0.2) {
                showToast('Using backup LaTeX server', 'info');
              }
            }
          }
          frag.appendChild(mathElement || document.createTextNode(restoreEscaped(m.full)));
          lastIndex = m.end;
        }
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(restoreEscaped(text.substring(lastIndex))));

        parent.setAttribute('data-tex-processing-node', 'true');
        parent.insertBefore(frag, textNode);
        parent.removeChild(textNode);
        parent.removeAttribute('data-tex-processing-node');
        hasChanges = true;
      });

      return hasChanges;
    } finally {
      rootElement.removeAttribute('data-tex-processing');
    }
  }

  // === Tree walker to find text nodes eligible for processing ===
  function findTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const p = node.parentElement;
          if (p?.classList?.contains('tex-math-inline') ||
              p?.classList?.contains('tex-math-display') ||
              p?.classList?.contains('tex-render-error') ||
              p?.getAttribute('data-processed') === 'true' ||
              p?.tagName === 'SCRIPT' || p?.tagName === 'STYLE' ||
              p?.tagName === 'CODE' || p?.tagName === 'PRE' || p?.tagName === 'TT') {
            return NodeFilter.FILTER_REJECT;
          }
          if (p?.tagName === 'IMG' && p?.alt?.match(/^\$+.*\$+$/)) return NodeFilter.FILTER_REJECT;
          let a = p;
          while (a && a !== element) {
            if (a.getAttribute('data-tex-processing') === 'true' ||
                a.tagName === 'CODE' || a.tagName === 'PRE' || a.tagName === 'TT') return NodeFilter.FILTER_REJECT;
            a = a.parentElement;
          }
          if ((node.textContent || '').trim().length > 0) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        }
      }
    );
    let n; while (n = walker.nextNode()) textNodes.push(n);
    return textNodes;
  }

  // === Debounced render scheduler ===
  function scheduleRender(composeArea) {
    if (composeArea.getAttribute('data-tex-render-scheduled') === 'true') {
      TeXForGmail.log('Render already scheduled for this compose area'); return;
    }
    const existingTimeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (existingTimeout) clearTimeout(existingTimeout);
    composeArea.setAttribute('data-tex-render-scheduled', 'true');
    const to = setTimeout(() => {
      composeArea.removeAttribute('data-tex-render-scheduled');
      if (composeArea.contains(document.activeElement) || composeArea === document.activeElement) {
        preserveCursorPosition(composeArea, () => { detectAndRenderLatex(composeArea); });
      } else {
        detectAndRenderLatex(composeArea);
      }
      TeXForGmail.renderTimeouts.delete(composeArea);
    }, CONFIG.renderDebounceDelay);
    TeXForGmail.renderTimeouts.set(composeArea, to);
  }

  // === Debounce utility ===
  function debounce(func, delay) {
    let id;
    return function(...args) { clearTimeout(id); id = setTimeout(() => func.apply(this, args), delay); };
  }

  // === Toasts & a11y ===
  // Toast spam control - track last toast time and message
  let lastToastTime = 0;
  let lastToastMessage = '';
  const TOAST_COOLDOWN = 500; // Minimum 500ms between toasts
  
  function showToast(message, type = 'info') {
    const now = Date.now();
    // Prevent toast spam - skip if same message shown recently
    if (message === lastToastMessage && (now - lastToastTime) < TOAST_COOLDOWN) {
      return;
    }
    lastToastTime = now;
    lastToastMessage = message;
    
    const existing = document.querySelector('.tex-toast'); if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `tex-toast tex-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: ${type === 'error' ? '#f44336' : (type === 'warning' ? '#ff9800' : '#333')};
      color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; opacity: 0; transition: opacity 0.3s;`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, CONFIG.toastDuration);
  }

  function ensureLiveRegions() {
    if (!document.getElementById('tex-live-status')) {
      const status = document.createElement('div'); status.id = 'tex-live-status'; status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
      status.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(status);
    }
    if (!document.getElementById('tex-live-alert')) {
      const alert = document.createElement('div'); alert.id = 'tex-live-alert'; alert.setAttribute('role', 'alert');
      alert.setAttribute('aria-live', 'assertive'); alert.setAttribute('aria-atomic', 'true');
      alert.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(alert);
    }
  }
  function announce(message, priority = 'polite') {
    const id = priority === 'assertive' ? 'tex-live-alert' : 'tex-live-status';
    const el = document.getElementById(id); if (!el) return;
    el.textContent = ''; void el.offsetHeight; el.textContent = message;
  }

  // === Get original LaTeX for wrapper/image ===
  TeXForGmail.getOriginalLatex = function(node) {
    if (!node) return null;
    const isElement = node && node.nodeType === 1;
    const isMathImage = (img) => {
      if (!img || img.tagName !== 'IMG') return false;
      if (img.getAttribute('data-original-source')) return true;
      const alt = img.alt || '';
      return /(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)*]+\\\)|\\\[[^\]]+\\\])/.test(alt);
    };
    const wrapper = (isElement && node.closest) ? node.closest('.tex-math-inline, .tex-math-display') : null;
    let img = null;
    if (wrapper) img = wrapper.querySelector('img');
    if (!img && isElement) {
      if (node.tagName === 'IMG' && isMathImage(node)) img = node;
      else if (node.closest) {
        const maybeImg = node.closest('img'); if (isMathImage(maybeImg)) img = maybeImg;
      }
      if (!img && node.querySelector) {
        const nested = node.querySelector('img'); if (isMathImage(nested)) img = nested;
      }
    }
    if (img) {
      const original = img.getAttribute('data-original-source'); if (original) return original;
    }
    if (wrapper) {
      const latex = wrapper.getAttribute('data-latex');
      if (latex) {
        const isDisplay = wrapper.classList.contains('tex-math-display');
        return isDisplay ? `$$${latex}$$` : `$${latex}$`;
      }
    }
    if (img && img.alt) return img.alt;
    if (isElement && node.closest) {
      const anyLatex = node.closest('[data-latex]');
      if (anyLatex && anyLatex.getAttribute) {
        const raw = anyLatex.getAttribute('data-latex');
        const displayHint = anyLatex.getAttribute('data-display');
        const isDisplay = displayHint === 'true' || displayHint === 'block' || anyLatex.classList?.contains('tex-math-display');
        return isDisplay ? `$$${raw}$$` : `$${raw}$`;
      }
    }
    return null;
  };

  // === Clipboard helpers & Copy UI ===
  async function copyTextToClipboard(text) {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      // execCommand is deprecated but still required for clipboard in some contexts
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (_) { return false; }
  }
  TeXForGmail.copyUI = { button: null, menu: null, currentWrapper: null, hideTimer: null };
  function createCopyButton() {
    if (TeXForGmail.copyUI.button) return TeXForGmail.copyUI.button;
    const btn = document.createElement('button');
    btn.className = 'tex-copy-button'; btn.type = 'button'; btn.textContent = 'Copy LaTeX';
    btn.setAttribute('aria-label', 'Copy LaTeX');
    btn.style.position = btn.style.position || 'absolute'; btn.style.top = btn.style.top || '2px'; btn.style.right = btn.style.right || '2px'; btn.style.display = 'none';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); e.preventDefault();
      const wrapper = TeXForGmail.copyUI.currentWrapper || btn.closest('.tex-math-inline, .tex-math-display');
      const source = TeXForGmail.getOriginalLatex(wrapper);
      if (!source) { showToast('Could not find LaTeX source', 'error'); announce('Copy failed: no LaTeX source found', 'assertive'); return; }
      const ok = await copyTextToClipboard(source);
      if (ok) { showToast('LaTeX copied to clipboard', 'info'); announce('LaTeX copied to clipboard', 'polite'); }
      else { showToast('Copy to clipboard failed', 'error'); announce('Copy to clipboard failed', 'assertive'); }
    });
    TeXForGmail.copyUI.button = btn; return btn;
  }
  function showCopyButton(wrapper) {
    if (!wrapper || !wrapper.isConnected) return;
    const settings = TeXForGmail.settings || {};
    if (settings.showCopyLatex === false) return;
    const btn = createCopyButton();
    TeXForGmail.copyUI.currentWrapper = wrapper;
    const cs = window.getComputedStyle(wrapper);
    if (!['relative','absolute','fixed','sticky'].includes(cs.position)) wrapper.style.position = 'relative';
    if (btn.parentElement !== wrapper) { if (btn.parentElement?.contains(btn)) btn.parentElement.removeChild(btn); wrapper.appendChild(btn); }
    btn.style.display = 'inline-flex';
  }
  function hideCopyButton() {
    const btn = TeXForGmail.copyUI.button;
    if (btn) { btn.style.display = 'none'; TeXForGmail.copyUI.currentWrapper = null; }
  }
  function ensureCopyInteractions() {
    document.addEventListener('mouseover', (e) => {
      const targetWrapper = e.target?.closest?.('.tex-math-inline, .tex-math-display');
      if (targetWrapper) showCopyButton(targetWrapper);
      else if (!document.activeElement || !document.activeElement.closest('.tex-math-inline, .tex-math-display')) hideCopyButton();
    }, true);
    document.addEventListener('focusin', (e) => {
      const targetWrapper = e.target?.closest?.('.tex-math-inline, .tex-math-display');
      if (targetWrapper) showCopyButton(targetWrapper);
    }, true);
  }
  function createCopyMenu() {
    if (TeXForGmail.copyUI.menu) return TeXForGmail.copyUI.menu;
    const menu = document.createElement('div');
    menu.className = 'tex-copy-menu'; menu.setAttribute('role', 'menu');
    menu.style.position = 'fixed'; menu.style.zIndex = '10001'; menu.style.background = '#fff'; menu.style.color = '#202124';
    menu.style.border = '1px solid #dadce0'; menu.style.borderRadius = '4px'; menu.style.minWidth = '140px'; menu.style.display = 'none';
    const item = document.createElement('div'); item.className = 'tex-copy-menuitem'; item.setAttribute('role', 'menuitem'); item.tabIndex = 0; item.textContent = 'Copy LaTeX';
    item.style.padding = '8px 12px'; item.style.cursor = 'pointer';
    item.addEventListener('mouseover', () => { item.style.background = '#e8f0fe'; });
    item.addEventListener('mouseout', () => { item.style.background = ''; });
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = (menu && menu._contextTarget) || TeXForGmail.copyUI.currentWrapper;
      const source = TeXForGmail.getOriginalLatex(target);
      if (!source) { showToast('Could not find LaTeX source', 'error'); announce('Copy failed: no LaTeX source found', 'assertive'); return closeCopyMenu(); }
      const ok = await copyTextToClipboard(source);
      if (ok) { showToast('LaTeX copied to clipboard', 'info'); announce('LaTeX copied to clipboard', 'polite'); }
      else { showToast('Copy to clipboard failed', 'error'); announce('Copy to clipboard failed', 'assertive'); }
      closeCopyMenu();
    });
    menu.appendChild(item); document.body.appendChild(menu);
    TeXForGmail.copyUI.menu = menu; return menu;
  }
  function openCopyMenu(x, y, wrapper) {
    const settings = TeXForGmail.settings || {};
    if (settings.showCopyLatex === false) return;
    const menu = createCopyMenu();
    menu._contextTarget = wrapper;
    TeXForGmail.copyUI.currentWrapper = wrapper;
    menu.style.display = 'block'; menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    menu.querySelector('[role="menuitem"]').focus();
    const onDocClick = (ev) => { if (!menu.contains(ev.target)) closeCopyMenu(); };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeCopyMenu(); }
      else if (ev.key === 'Enter' || ev.key === ' ') {
        const focused = document.activeElement; if (menu.contains(focused)) focused.click();
      }
    };
    menu._onDocClick = onDocClick; menu._onKey = onKey;
    setTimeout(() => { document.addEventListener('click', onDocClick, true); document.addEventListener('keydown', onKey, true); }, 0);
  }
  function closeCopyMenu() {
    const menu = TeXForGmail.copyUI.menu; if (!menu) return;
    menu.style.display = 'none';
    if (menu._onDocClick) document.removeEventListener('click', menu._onDocClick, true);
    if (menu._onKey) document.removeEventListener('keydown', menu._onKey, true);
    menu._onDocClick = null; menu._onKey = null; menu._contextTarget = null;
  }
  function ensureContextMenu() {
    const findMathTarget = (target) => {
      if (!target) return null;
      if (target.closest) {
        const w = target.closest('.tex-math-inline, .tex-math-display'); if (w) return w;
      }
      const asImg = target.tagName === 'IMG' ? target : (target.closest ? target.closest('img') : null);
      if (asImg) {
        const alt = asImg.alt || '';
        const isMathAlt = /(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)*]+\\\)|\\\[[^\]]+\\\])/.test(alt);
        if (isMathAlt || asImg.getAttribute('data-original-source')) return asImg;
      }
      return null;
    };
    document.addEventListener('contextmenu', (e) => {
      const target = findMathTarget(e.target); if (!target) return;
      e.preventDefault(); e.stopPropagation();
      openCopyMenu(e.clientX, e.clientY, target);
    }, true);
    document.addEventListener('keydown', (e) => {
      const isMenuKey = (e.key === 'ContextMenu') || (e.shiftKey && (e.key === 'F10'));
      if (!isMenuKey) return;
      const active = document.activeElement; if (!active) return;
      let target = active.closest?.('.tex-math-inline, .tex-math-display') || null;
      if (!target && active.tagName === 'IMG') {
        const alt = active.alt || '';
        if (/(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)*]+\\\)|\\\[[^\]]+\\\])/.test(alt) || active.getAttribute('data-original-source')) target = active;
      }
      if (!target) return;
      e.preventDefault(); e.stopPropagation();
      const rect = target.getBoundingClientRect();
      const x = Math.round(rect.left + Math.min(16, rect.width / 2));
      const y = Math.round(rect.top + Math.min(24, rect.height / 2));
      openCopyMenu(x, y, target);
    }, true);
  }

  // === Compose area helpers ===
  function findComposeAreaForButton(button) {
    const composeWindow = button.closest('.M9, .AD, .aoI');
    if (composeWindow) {
      for (const selector of CONFIG.composeSelectors) {
        const composeArea = composeWindow.querySelector(selector);
        if (composeArea) { TeXForGmail.log(`Compose area found for button with selector: ${selector}`); return composeArea; }
      }
    }
    TeXForGmail.log('Compose area not found for button'); return null;
  }
  function findComposeArea() {
    const active = document.activeElement;
    if (active) {
      for (const selector of CONFIG.composeSelectors) {
        if (active.matches?.(selector)) { TeXForGmail.log(`Active compose area found with selector: ${selector}`); return active; }
      }
      for (const selector of CONFIG.composeSelectors) {
        const parent = active.closest?.(selector);
        if (parent) { TeXForGmail.log(`Parent compose area found with selector: ${selector}`); return parent; }
      }
    }
    for (const selector of CONFIG.composeSelectors) {
      const el = document.querySelector(selector);
      if (el) { TeXForGmail.log(`Compose area found with selector: ${selector}`); return el; }
    }
    TeXForGmail.log('Compose area not found'); return null;
  }

  // === TeX button ===
  function createTexButton() {
    const button = document.createElement('div');
    button.className = 'tex-button wG J-Z-I';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Toggle LaTeX rendering');
    button.setAttribute('data-tooltip', 'LaTeX rendering is OFF - Click to toggle ON');
    button.setAttribute('data-toggle-state', 'inactive');
    button.style.cssText = 'display:inline-flex !important; align-items:center; justify-content:center; user-select:none; margin:0 8px; cursor:pointer; padding:6px 12px; background:#9e9e9e; color:white; border-radius:4px; font-weight:bold; font-size:14px; height:30px; vertical-align:middle;';
    button.innerHTML = '📐 TeX OFF';
    return button;
  }

  function handleTexButtonClick(button) {
    if (!button.dataset) button.dataset = {};
    if (button.dataset.processing === 'true') { TeXForGmail.log('Already processing, ignoring click'); return; }
    button.dataset.processing = 'true'; button.disabled = true;
    const processToggle = new Promise((resolve, reject) => {
      try {
        button.textContent = '⏳ Processing...'; button.style.cursor = 'wait'; button.style.opacity = '0.6';
        const composeArea = findComposeAreaForButton(button);
        if (composeArea) {
          TeXForGmail.log('Toggling LaTeX rendering state');
          requestAnimationFrame(() => {
            try {
              const newState = toggleRendering(composeArea);
              button.style.cursor = 'pointer'; button.style.opacity = '1'; updateButtonVisualState(button, newState);
              resolve(newState);
            } catch (error) {
              TeXForGmail.log('Error during toggle:', error);
              button.style.cursor = 'pointer'; button.style.opacity = '1';
              const currentState = composeArea ? getToggleState(composeArea) : false;
              updateButtonVisualState(button, currentState);
              reject(error);
            }
          });
        } else {
          button.style.cursor = 'pointer'; button.style.opacity = '1';
          button.textContent = '📐 TeX OFF'; button.style.background = '#9e9e9e';
          showToast('Could not find compose area. Please try again.', 'error');
          reject(new Error('Compose area not found'));
        }
      } catch (error) {
        TeXForGmail.log('Error in button click handler:', error);
        reject(error);
      }
    });
    processToggle.finally(() => {
      button.dataset.processing = 'false';
      button.disabled = false;
      TeXForGmail.processingStates.delete(button);
    });
  }

  function setupAutoRenderObserver(composeArea) {
    if (!TeXForGmail.observerSetupFlags) TeXForGmail.observerSetupFlags = new WeakMap();
    if (TeXForGmail.observerSetupFlags.get(composeArea)) { TeXForGmail.log('Observer setup already in progress, skipping'); return; }
    TeXForGmail.observerSetupFlags.set(composeArea, true);
    try {
      const existing = TeXForGmail.composeObservers.get(composeArea);
      if (existing) { existing.disconnect(); TeXForGmail.composeObservers.delete(composeArea); }
      if (!getToggleState(composeArea)) { TeXForGmail.log('Not setting up observer - toggle is OFF'); return; }
      const debouncedRender = debounce(() => {
        if (getToggleState(composeArea)) { TeXForGmail.log('Observer triggered, scheduling render'); scheduleRender(composeArea); }
        else { TeXForGmail.log('Observer triggered but toggle is OFF'); }
      }, CONFIG.debounceDelay);
      const observer = new MutationObserver((mutations) => {
        let hasTextChanges = false;
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && node.textContent)) { hasTextChanges = true; break; }
            }
          } else if (m.type === 'characterData') {
            if (m.target.nodeType === Node.TEXT_NODE) hasTextChanges = true;
          }
          if (hasTextChanges) break;
        }
        if (hasTextChanges) debouncedRender();
      });
      observer.observe(composeArea, { childList: true, subtree: true, characterData: true });
      TeXForGmail.composeObservers.set(composeArea, observer);
      setupRemovalObserver(composeArea);
      TeXForGmail.log('Auto-render observer set up for compose area');
    } finally {
      TeXForGmail.observerSetupFlags.delete(composeArea);
    }
  }

  function setupRemovalObserver(composeArea) {
    if (!TeXForGmail.removalObservers) TeXForGmail.removalObservers = new WeakMap();
    const existingRemoval = TeXForGmail.removalObservers.get(composeArea);
    if (existingRemoval) existingRemoval.disconnect();
    const parentContainer = composeArea.closest('.M9, .AD, .aoI') || composeArea.parentElement;
    if (!parentContainer) { TeXForGmail.log('Could not find parent container for removal observer'); return; }
    const removalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === composeArea || (removedNode.nodeType === Node.ELEMENT_NODE && removedNode.contains(composeArea))) {
            TeXForGmail.log('Compose area removed from DOM, cleaning up');
            performComprehensiveCleanup(composeArea);
            removalObserver.disconnect(); TeXForGmail.removalObservers.delete(composeArea);
            return;
          }
        }
      }
      if (!document.contains(composeArea)) {
        TeXForGmail.log('Compose area no longer in document, cleaning up');
        performComprehensiveCleanup(composeArea);
        removalObserver.disconnect(); TeXForGmail.removalObservers.delete(composeArea);
      }
    });
    removalObserver.observe(parentContainer, { childList: true, subtree: false });
    TeXForGmail.removalObservers.set(composeArea, removalObserver);
  }

  function performComprehensiveCleanup(composeArea) {
    TeXForGmail.log('Performing comprehensive cleanup for compose area');
    const contentObserver = TeXForGmail.composeObservers.get(composeArea);
    if (contentObserver) { contentObserver.disconnect(); TeXForGmail.composeObservers.delete(composeArea); TeXForGmail.log('Content observer disconnected and cleaned'); }
    if (TeXForGmail.removalObservers) {
      const removalObserver = TeXForGmail.removalObservers.get(composeArea);
      if (removalObserver) { removalObserver.disconnect(); TeXForGmail.removalObservers.delete(composeArea); TeXForGmail.log('Removal observer disconnected and cleaned'); }
    }
    const renderTimeout = TeXForGmail.renderTimeouts.get(composeArea);
    if (renderTimeout) { clearTimeout(renderTimeout); TeXForGmail.renderTimeouts.delete(composeArea); TeXForGmail.log('Render timeout cleared'); }
    if (TeXForGmail.toggleStates.has(composeArea)) { TeXForGmail.toggleStates.delete(composeArea); TeXForGmail.log('Toggle state cleaned'); }
    if (TeXForGmail.originalContent.has(composeArea)) { TeXForGmail.originalContent.delete(composeArea); TeXForGmail.log('Original content snapshot cleaned'); }
    const button = getButtonForComposeArea(composeArea);
    if (button) {
      TeXForGmail.processingStates.delete(button);
      const parent = composeArea.closest('.M9, .AD, .aoI');
      if (parent) {
        const toolbar = parent.querySelector('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
        if (toolbar) TeXForGmail.composeButtons.delete(toolbar);
      }
      TeXForGmail.log('Button associations cleaned');
    }
    if (window.gc && typeof window.gc === 'function') { try { window.gc(); } catch (_) {} }
  }

  // Removed unused function cleanupComposeObserver - using performComprehensiveCleanup directly
  function cleanupToolbarButton(toolbar) {
    const button = TeXForGmail.composeButtons.get(toolbar);
    if (button) { TeXForGmail.composeButtons.delete(toolbar); TeXForGmail.processingStates.delete(button); }
  }

  // === Inject TeX button into compose window ===
  async function addTexButton(composeElement) {
    const settings = await TeXForGmail.getSettings();
    if (!settings.showComposeButton) { TeXForGmail.log('Compose button disabled in settings'); return; }
    const toolbarSelectors = ['.aZ .J-J5-Ji', '.aZ .J-Z-I', '.gU .J-Z-I', '[gh="tl"] .J-J5-Ji'];
    let toolbar = null;
    for (const sel of toolbarSelectors) { toolbar = composeElement.querySelector(sel); if (toolbar) break; }
    if (!toolbar) {
      const parent = composeElement.closest('.M9, .AD');
      if (parent) for (const sel of toolbarSelectors) { toolbar = parent.querySelector(sel); if (toolbar) break; }
    }
    if (!toolbar) { TeXForGmail.log('Toolbar not found in compose window'); return; }
    if (TeXForGmail.composeButtons.has(toolbar)) { TeXForGmail.log('Button already exists for this toolbar (WeakMap)'); return; }
    const existingButton = toolbar.querySelector('.tex-button');
    if (existingButton) { TeXForGmail.log('Button already exists for this toolbar (DOM)'); TeXForGmail.composeButtons.set(toolbar, existingButton); return; }
    const button = createTexButton();
    button.addEventListener('click', () => handleTexButtonClick(button));
    button.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTexButtonClick(button); } });
    toolbar.appendChild(button);
    TeXForGmail.composeButtons.set(toolbar, button);
    button.dataset.composeId = composeElement.id || Math.random().toString(36).substring(2, 11);
    TeXForGmail.log('Button added to compose toolbar');
    button.style.display = 'inline-flex !important'; button.style.visibility = 'visible !important';
    const composeArea = findComposeAreaForButton(button);
    if (composeArea) {
      // Initialize toggle state based on user preference (default to true for auto-render)
      // Note: autoRenderOnCompose defaults to true unless explicitly set to false
      const autoRender = TeXForGmail.settings?.autoRenderOnCompose !== false;
      setToggleState(composeArea, autoRender);
      updateButtonVisualState(button, autoRender);
      TeXForGmail.log(`Button initialized in ${autoRender ? 'ON' : 'OFF'} state - LaTeX rendering ${autoRender ? 'enabled' : 'disabled'}`);
      
      // If auto-render is enabled, schedule initial render
      if (autoRender) {
        setTimeout(() => {
          if (document.contains(composeArea)) {
            detectAndRenderLatex(composeArea);
          }
        }, 500);
      }
    }
  }

  function checkForComposeWindow() {
    const processedToolbars = new Set();
    const composeWindows = document.querySelectorAll('.M9, .AD, .aoI');
    composeWindows.forEach(compose => {
      const toolbar = compose.querySelector('.aZ');
      if (toolbar && !processedToolbars.has(toolbar)) { processedToolbars.add(toolbar); addTexButton(compose); }
    });
    const allToolbars = document.querySelectorAll('.aZ .J-J5-Ji, .aZ .J-Z-I, .gU .J-Z-I, [gh="tl"] .J-J5-Ji');
    allToolbars.forEach(toolbar => { if (!toolbar.closest('.M9, .AD, .aoI')) cleanupToolbarButton(toolbar); });
    checkForReadingView();
  }

  function checkForReadingView() {
    const emailContainers = document.querySelectorAll('.ii, .a3s, .adP');
    emailContainers.forEach(container => {
      const toolbarSelectors = ['.btC', '.aqK', '.G-atb', '.iH > div', '.aaq'];
      let toolbar = null;
      for (const sel of toolbarSelectors) {
        const parent = container.closest('.h7, .adn, .Bs');
        if (parent) { toolbar = parent.querySelector(sel); if (toolbar) break; }
      }
      if (toolbar && !TeXForGmail.readButtons.get(toolbar)) {
        TeXForGmail.log('Found email reading view, adding button');
        addReadModeButton(container, toolbar);
      }
    });
    TeXForGmail.readButtons.forEach((_, toolbar) => {
      if (!document.body.contains(toolbar)) { TeXForGmail.readButtons.delete(toolbar); TeXForGmail.log('Cleaned up read mode button for removed toolbar'); }
    });
  }

  async function addReadModeButton(emailContainer, toolbar) {
    const settings = await TeXForGmail.getSettings();
    if (!settings.showReadButton) { TeXForGmail.log('Read mode button disabled in settings'); return; }
    if (TeXForGmail.readButtons.get(toolbar)) { TeXForGmail.log('Read mode button already exists for this toolbar'); return; }
    const button = createTexButton();
    TeXForGmail.readButtons.set(toolbar, button);
    button.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      TeXForGmail.log('Read mode TeX button clicked');
      if (TeXForGmail.processingStates.get(button)) { TeXForGmail.log('Already processing, ignoring click'); return; }
      TeXForGmail.processingStates.set(button, true);
      try {
        const isActive = button.getAttribute('aria-pressed') === 'true';
        if (!isActive) {
          button.style.background = '#e3f2fd'; button.setAttribute('aria-pressed', 'true');
          await TeXForGmail.renderReadOverlay(emailContainer);
          showToast('LaTeX rendered in email', 'success');
          TeXForGmail.log('Read mode LaTeX rendering complete');
        } else {
          button.style.background = ''; button.setAttribute('aria-pressed', 'false');
          TeXForGmail.removeReadOverlay(emailContainer);
          showToast('LaTeX rendering disabled', 'info');
        }
      } catch (error) {
        TeXForGmail.log('Error in read mode button handler:', error); showToast('Error rendering LaTeX', 'error');
      } finally {
        TeXForGmail.processingStates.delete(button);
      }
    });
    const group = toolbar.querySelector('.aaq, .btC, .G-atb');
    if (group) { button.style.marginLeft = '8px'; group.appendChild(button); } else { toolbar.appendChild(button); }
    TeXForGmail.log('Read mode TeX button added to toolbar');
  }

  // === Main DOM observer, More menu observer, Send interceptor, Keyboard ===
  TeXForGmail.setupObserver = function() {
    const debouncedCheck = debounce(checkForComposeWindow, CONFIG.debounceDelay);
    this.observer = new MutationObserver(debouncedCheck);
    this.observer.observe(document.body, CONFIG.observerConfig);
    TeXForGmail.log('Observer watching for compose windows');
    this.setupSendInterceptor();
    this.setupMoreMenuObserver();
  };

  TeXForGmail.setupMoreMenuObserver = function() {
    const containsLatex = (emailElement) => {
      if (!emailElement) return false;
      const text = emailElement.textContent || '';
      return /\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\[\[\(][\s\S]+?\\[\]\)]|\\begin\{[\s\S]+?\\end\{/.test(text);
    };
    const addRenderMenuItem = (menu, emailElement) => {
      if (menu.querySelector('.tex-gmail-menu-item')) return;
      const existingItem = menu.querySelector('.J-N'); if (!existingItem) return;
      const menuItem = existingItem.cloneNode(true);
      menuItem.className = existingItem.className + ' tex-gmail-menu-item';
      const textElement = menuItem.querySelector('[role="menuitem"]') || menuItem;
      textElement.textContent = 'Render LaTeX';
      menuItem.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        TeXForGmail.log('More menu: Render LaTeX clicked');
        const backdrop = document.querySelector('.J-M-Jz'); if (backdrop) backdrop.click();
        showToast('Rendering LaTeX in email...', 'info');
        await TeXForGmail.renderReadOverlay(emailElement);
        showToast('LaTeX rendering complete', 'success');
      });
      const separator = menu.querySelector('.J-Kh'); if (separator) menu.appendChild(separator.cloneNode(true));
      menu.appendChild(menuItem);
      TeXForGmail.log('Added Render LaTeX to More menu');
    };
    const moreMenuObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const menu = node.querySelector?.('.J-M') || (node.classList?.contains('J-M') ? node : null);
            if (menu) {
              TeXForGmail.log('More menu detected');
              const emailElement = document.querySelector('.ii:hover, .a3s:hover, .adP:hover') || document.querySelector('.ii, .a3s, .adP');
              if (emailElement && containsLatex(emailElement)) addRenderMenuItem(menu, emailElement);
            }
          }
        });
      });
    });
    moreMenuObserver.observe(document.body, { childList: true, subtree: true });
    this.moreMenuObserver = moreMenuObserver;
    this.log('More menu observer initialized');
  };

  TeXForGmail.setupKeyboardHandler = function() {
    if (!this.keyboardHandler) { this.keyboardHandler = this.handleGlobalKeyboard.bind(this); document.addEventListener('keydown', this.keyboardHandler, true); this.log('Keyboard handler registered'); }
  };

  TeXForGmail.handleGlobalKeyboard = async function(e) {
    const settings = await this.getSettings();
    const isShortcutKey = (e.key === 'F8' || e.key === 'F9');
    if (!settings?.enableKeyboardShortcuts) {
      if (isShortcutKey || (e.ctrlKey && e.shiftKey)) { showToast(`Keyboard shortcuts are disabled. Enable them in TeX for Gmail settings.`, 'warning'); return; }
    }
    const composeArea = this.getActiveTarget();

    if (e.key === 'Tab' && composeArea && settings?.enableKeyboardShortcuts) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE && container.textContent.includes('{}')) {
          e.preventDefault(); e.stopPropagation(); this.navigateTemplate(e.shiftKey ? 'prev' : 'next'); return;
        }
      }
    }

    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && settings?.enableKeyboardShortcuts) {
      const template = this.TEX_TEMPLATES[e.key.toUpperCase()];
      if (template && composeArea) {
        e.preventDefault(); e.stopPropagation();
        if (this.insertTexTemplate(template.template)) { showToast(`Inserted ${template.name}`, 'info'); this.log(`Template shortcut: Inserted ${template.name}`); }
        return;
      }
    }

    if (e.key === 'F8' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      const target = this.getActiveTarget();
      if (target) { this.log('F8 pressed: Rendering Rich Math once'); showToast('Rendering LaTeX as Rich Math...', 'info'); await this.renderOnceRichMath(target); showToast('Rich Math rendering complete', 'success'); }
    } else if (e.key === 'F9' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      const target = this.getActiveTarget();
      if (target) {
        if (!settings.enableSimpleMath) { showToast('Simple Math mode is disabled in settings', 'warning'); return; }
        this.log('F9 pressed: Rendering Simple Math once'); showToast('Rendering LaTeX as Simple Math...', 'info'); await this.renderOnceSimpleMath(target); showToast('Simple Math rendering complete', 'success');
      }
    } else if (e.key === 'F8' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); e.stopPropagation(); this.log('Cmd/Ctrl+F8 pressed: Toggling continuous Rich Math'); await this.toggleContinuousMode('rich');
    } else if (e.key === 'F9' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); e.stopPropagation(); this.log('Cmd/Ctrl+F9 pressed: Toggling continuous Simple Math');
      if (!settings.enableSimpleMath) { showToast('Simple Math mode is disabled in settings', 'warning'); return; }
      await this.toggleContinuousMode('simple');
    }
  };

  TeXForGmail.getActiveTarget = function() {
    const active = document.activeElement;
    const composeArea = active?.closest?.('.M9, .AD, .aoI, [contenteditable="true"]');
    if (composeArea) { this.log('Active target: Compose area'); return composeArea; }
    const emailContainers = document.querySelectorAll('.ii, .a3s, .adP');
    if (emailContainers.length > 0) {
      for (const c of emailContainers) if (c.offsetParent !== null) { this.log('Active target: Email reading area'); return c; }
    }
    this.log('No active target found'); return null;
  };

  TeXForGmail.renderOnceRichMath = async function(targetElement) {
    this.log('Rendering once with Rich Math');
    const previous = this.simpleMode; this.simpleMode = false;
    try {
      const isRead = targetElement.classList.contains('ii') || targetElement.classList.contains('a3s') || targetElement.classList.contains('adP');
      if (isRead) await this.renderReadOverlay(targetElement);
      else detectAndRenderLatex(targetElement, { oneTimeRender: true, isReadMode: false });
      this.log('One-time Rich Math rendering complete'); return Promise.resolve();
    } catch (error) { this.log('Error in renderOnceRichMath:', error); showToast('Error rendering Rich Math', 'error'); return Promise.reject(error); }
    finally { this.simpleMode = previous; }
  };

  TeXForGmail.renderOnceSimpleMath = async function(targetElement) {
    this.log('Rendering once with Simple Math');
    const settings = await this.getSettings();
    if (!settings?.enableSimpleMath) { showToast('Simple Math mode is disabled in settings', 'warning'); return; }
    const previous = this.simpleMode; this.simpleMode = true;
    try {
      const isRead = targetElement.classList.contains('ii') || targetElement.classList.contains('a3s') || targetElement.classList.contains('adP');
      if (isRead) await this.renderReadOverlay(targetElement);
      else detectAndRenderLatex(targetElement, { oneTimeRender: true, isReadMode: false });
      this.log('One-time Simple Math rendering complete'); return Promise.resolve();
    } catch (error) { this.log('Error in renderOnceSimpleMath:', error); showToast('Error rendering Simple Math', 'error'); return Promise.reject(error); }
    finally { this.simpleMode = previous; }
  };

  // Toggle continuous rendering (uses existing observer paths; boolean toggle only)
  TeXForGmail.toggleContinuousMode = async function(mode) {
    const settings = await this.getSettings();
    if (mode === 'simple' && !settings?.enableSimpleMath) { showToast('Simple Math mode is disabled in settings', 'warning'); return; }
    const target = this.getActiveTarget();
    if (!target) { showToast('No active compose or email area found', 'error'); return; }
    const isCompose = !!target.closest('.M9, .AD, .aoI, [contenteditable="true"]');
    if (!isCompose) {
      // read mode → one-time
      showToast('Rendering LaTeX in email...', 'info');
      if (mode === 'simple') await this.renderOnceSimpleMath(target); else await this.renderOnceRichMath(target);
      showToast('Email rendering complete', 'success');
      return;
    }
    // Compose continuous
    this.simpleMode = (mode === 'simple');
    const currentState = getToggleState(target);
    if (!currentState) {
      setToggleState(target, true);
      setupAutoRenderObserver(target);
      detectAndRenderLatex(target);
      const modeText = mode === 'simple' ? 'Simple Math' : 'Rich Math';
      showToast(`Continuous ${modeText} rendering enabled`, 'success');
      this.log(`Toggled continuous ${modeText} mode ON`);
    } else {
      setToggleState(target, false);
      restoreLatexSource(target);
      performComprehensiveCleanup(target);
      showToast('Continuous rendering disabled', 'info');
      this.log('Toggled continuous mode OFF');
    }
  };

  // === Send dialog & Interceptor ===
  function createSendDialog() {
    if (document.getElementById('tex-gmail-send-dialog')) return document.getElementById('tex-gmail-send-dialog');
    const dialog = document.createElement('div');
    dialog.id = 'tex-gmail-send-dialog';
    dialog.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; border-radius: 8px; box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2);
      z-index: 9999; padding: 24px; min-width: 400px; max-width: 500px; display: none; font-family: 'Roboto', 'Google Sans', Arial, sans-serif;`;
    dialog.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin:0 0 16px 0; font-size:20px; font-weight:400; color:#202124;">LaTeX Rendering</h2>
        <p style="margin:0; color:#5f6368; font-size:14px; line-height:20px;">Your email contains LaTeX equations. Render them as images before sending?</p>
        <div style="margin-top:12px; padding:12px; background:#f8f9fa; border-radius:4px;">
          <p style="margin:0; color:#5f6368; font-size:12px;"><strong>Note:</strong> Rendering converts LaTeX code into images that all recipients can view.</p>
        </div>
      </div>
      <div style="margin:20px 0; padding:12px 0; border-top:1px solid #e8eaed;">
        <label style="display:flex; align-items:center; cursor:pointer; font-size:14px; color:#5f6368;">
          <input type="checkbox" id="tex-gmail-remember-choice" style="margin-right:8px; cursor:pointer;"> Remember my choice for this session
        </label>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="tex-gmail-cancel-send" style="padding:8px 16px; border:1px solid #dadce0; background:white; color:#5f6368; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s;">Cancel</button>
        <button id="tex-gmail-send-without-render" style="padding:8px 16px; border:1px solid #dadce0; background:white; color:#202124; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s;">Send without rendering</button>
        <button id="tex-gmail-render-and-send" style="padding:8px 16px; border:none; background:#1a73e8; color:white; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s;">Render and Send</button>
      </div>`;
    const backdrop = document.createElement('div');
    backdrop.id = 'tex-gmail-dialog-backdrop';
    backdrop.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:9998; display:none;`;
    const style = document.createElement('style');
    style.textContent = `
      #tex-gmail-render-and-send:hover { background:#1557b0 !important; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
      #tex-gmail-send-without-render:hover, #tex-gmail-cancel-send:hover { background:#f8f9fa !important; border-color:#9aa0a6 !important; }
      #tex-gmail-send-dialog button:focus { outline:2px solid #1a73e8; outline-offset:2px; }`;
    document.head.appendChild(style);
    document.body.appendChild(backdrop); document.body.appendChild(dialog);
    return dialog;
  }
  function showSendDialog() {
    return new Promise((resolve) => {
      const dialog = createSendDialog();
      const backdrop = document.getElementById('tex-gmail-dialog-backdrop');
      dialog.style.display = 'block'; backdrop.style.display = 'block';
      const renderButton = document.getElementById('tex-gmail-render-and-send'); renderButton.focus();
      const cancelButton = document.getElementById('tex-gmail-cancel-send');
      const sendWithoutButton = document.getElementById('tex-gmail-send-without-render');
      const rememberCheckbox = document.getElementById('tex-gmail-remember-choice');
      const cleanup = () => {
        dialog.style.display = 'none'; backdrop.style.display = 'none';
        cancelButton.removeEventListener('click', handleCancel);
        sendWithoutButton.removeEventListener('click', handleSendWithout);
        renderButton.removeEventListener('click', handleRenderAndSend);
        document.removeEventListener('keydown', handleEscape);
      };
      const handleCancel = () => { cleanup(); resolve({ action: 'cancel', remember: rememberCheckbox.checked }); };
      const handleSendWithout = () => { cleanup(); resolve({ action: 'send_without_render', remember: rememberCheckbox.checked }); };
      const handleRenderAndSend = () => { cleanup(); resolve({ action: 'render_and_send', remember: rememberCheckbox.checked }); };
      const handleEscape = (e) => { if (e.key === 'Escape') handleCancel(); else if (e.key === 'Enter' && !e.shiftKey) handleRenderAndSend(); };
      cancelButton.addEventListener('click', handleCancel);
      sendWithoutButton.addEventListener('click', handleSendWithout);
      renderButton.addEventListener('click', handleRenderAndSend);
      document.addEventListener('keydown', handleEscape);
    });
  }

  TeXForGmail.setupSendInterceptor = function() {
    let programmaticSendInProgress = false;

    const renderAndWaitForImages = async function(composeArea) {
      return new Promise((resolve, reject) => {
        try {
          const originalState = getToggleState(composeArea);
          setToggleState(composeArea, true);
          const hasChanges = detectAndRenderLatex(composeArea);
          if (!hasChanges) {
            if (!originalState) setToggleState(composeArea, false);
            resolve({ rendered: false, originalState });
            return;
          }
          const images = composeArea.querySelectorAll('.tex-math-inline img, .tex-math-display img');
          if (images.length === 0) { resolve({ rendered: true, originalState }); return; }
          let loaded = 0, errors = 0, total = images.length;
          const check = () => {
            if (loaded + errors >= total) {
              if (errors > 0) TeXForGmail.log(`Warning: ${errors} LaTeX images failed to load`);
              resolve({ rendered: true, originalState });
            }
          };
          images.forEach(img => {
            if (img.complete) { loaded++; }
            else {
              img.addEventListener('load', () => { loaded++; check(); }, { once: true });
              img.addEventListener('error', () => { errors++; TeXForGmail.log('LaTeX image failed to load:', img.src); check(); }, { once: true });
            }
          });
          check();
          setTimeout(() => { TeXForGmail.log('Image loading timeout - proceeding with send'); resolve({ rendered: true, originalState }); }, 5000);
        } catch (error) { TeXForGmail.log('Error in renderAndWaitForImages:', error); reject(error); }
      });
    };

    const interceptSend = async function(event) {
      if (programmaticSendInProgress) { TeXForGmail.log('Programmatic send in progress, not intercepting'); return; }
      const target = event.target;
      const isKeyboard = event.type === 'keydown';

      let shouldIntercept = false;
      let sendButton = null;
      let composeArea = null;

      if (isKeyboard) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          const activeElement = document.activeElement;
          if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            composeArea = activeElement; shouldIntercept = true; TeXForGmail.log('Keyboard send detected (Ctrl/Cmd+Enter)');
          }
        }
      } else {
        const possibleButton = target?.closest?.('div[role="button"], button');
        if (possibleButton) {
          // More precise send button detection - only match actual send buttons
          const composeContainer = possibleButton.closest('.M9, .AD, .aoI');
          if (composeContainer) {
            // Find the actual send button in this compose window
            const realSendButton = composeContainer.querySelector(
              'div[role="button"][data-tooltip*="Send"], div[role="button"][aria-label*="Send"]'
            );
            // Only intercept if this is the actual send button
            const looksLikeSend = realSendButton && (possibleButton === realSendButton);
            if (looksLikeSend) {
              sendButton = possibleButton;
              composeArea = composeContainer.querySelector('[contenteditable="true"][g_editable="true"], [contenteditable="true"][role="textbox"], div[aria-label*="Message Body"]');
              if (composeArea) { shouldIntercept = true; TeXForGmail.log('Send button click detected'); }
            }
          }
        }
      }

      if (!shouldIntercept || !composeArea) return;

      const textContent = composeArea.textContent || '';
      const hasLatexTokens = /\$\$[\s\S]*?\$\$|(?<!\$)\$([^\$\n]+?)\$|\\\(|\\\[|\\begin\{/.test(textContent);
      const hasRenderedMath = !!composeArea.querySelector('.tex-math-inline, .tex-math-display');

      if (!(hasLatexTokens || hasRenderedMath)) return; // allow send

      const settings = await TeXForGmail.getSettings();
      const toggleOn = getToggleState(composeArea);

      // If toggle is ON or hasRenderedMath, ensure images are loaded before send
      if (toggleOn || hasRenderedMath) {
        event.preventDefault(); event.stopImmediatePropagation();
        try {
          await renderAndWaitForImages(composeArea);
        } catch (_) {}
        // trigger send
        programmaticSendInProgress = true;
        if (sendButton) {
          const newClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 });
          sendButton.dispatchEvent(newClick);
        } else if (isKeyboard) {
          const sendButtons = composeArea.closest('.M9, .AD, .aoI')?.querySelectorAll('[data-tooltip*="Send"], [aria-label*="Send"]');
          if (sendButtons?.length > 0) sendButtons[0].click();
        }
        setTimeout(() => { programmaticSendInProgress = false; }, 1000);
        return;
      }

      // Toggle is OFF: obey behavior (always/never/ask)
      let shouldRender = false;
      let userChoice = null;

      if (settings.sendBehavior === 'always') {
        shouldRender = true;
        TeXForGmail.log('Send behavior is "always", will render LaTeX');
      } else if (settings.sendBehavior === 'never') {
        TeXForGmail.log('Send behavior is "never", sending without rendering');
        return; // allow
      } else {
        if (settings.rememberSendChoice && settings.lastSendChoice) {
          shouldRender = settings.lastSendChoice === 'render';
          TeXForGmail.log(`Using remembered choice: ${settings.lastSendChoice}`);
        } else {
          event.preventDefault(); event.stopImmediatePropagation();
          userChoice = await showSendDialog();
          if (userChoice.action === 'cancel') { TeXForGmail.log('User cancelled send'); return; }
          else if (userChoice.action === 'send_without_render') {
            shouldRender = false;
            if (userChoice.remember) { settings.rememberSendChoice = true; settings.lastSendChoice = 'send_without'; storageService.set({ rememberSendChoice: true, lastSendChoice: 'send_without' }); }
          } else if (userChoice.action === 'render_and_send') {
            shouldRender = true;
            if (userChoice.remember) { settings.rememberSendChoice = true; settings.lastSendChoice = 'render'; storageService.set({ rememberSendChoice: true, lastSendChoice: 'render' }); }
          }
        }
      }

      if (shouldRender) {
        if (!userChoice) { event.preventDefault(); event.stopImmediatePropagation(); }
        if (!TeXForGmail.sendProcessingStates) TeXForGmail.sendProcessingStates = new WeakMap();
        if (TeXForGmail.sendProcessingStates.get(composeArea)) { TeXForGmail.log('Already processing send for this compose area'); return; }
        TeXForGmail.sendProcessingStates.set(composeArea, true);
        try {
          const result = await renderAndWaitForImages(composeArea);
          programmaticSendInProgress = true;
          if (sendButton) {
            const newClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 });
            sendButton.dispatchEvent(newClick);
          } else if (isKeyboard) {
            const sendButtons = composeArea.closest('.M9, .AD, .aoI')?.querySelectorAll('[data-tooltip*="Send"], [aria-label*="Send"]');
            if (sendButtons?.length > 0) sendButtons[0].click();
          }
          setTimeout(() => {
            programmaticSendInProgress = false;
            TeXForGmail.sendProcessingStates.delete(composeArea);
            if (!result.originalState && document.contains(composeArea)) {
              TeXForGmail.log('Restoring LaTeX source after send');
              setToggleState(composeArea, false);
              restoreLatexSource(composeArea);
            }
          }, 2000);
        } catch (error) {
          TeXForGmail.log('Error during send interception:', error);
          programmaticSendInProgress = false;
          TeXForGmail.sendProcessingStates.delete(composeArea);
          if (sendButton) {
            programmaticSendInProgress = true; sendButton.click();
            setTimeout(() => { programmaticSendInProgress = false; }, 500);
          }
        }
      } else if (userChoice && userChoice.action === 'send_without_render') {
        programmaticSendInProgress = true;
        if (sendButton) {
          const newClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 });
          sendButton.dispatchEvent(newClick);
        } else if (isKeyboard) {
          const sendButtons = composeArea.closest('.M9, .AD, .aoI')?.querySelectorAll('[data-tooltip*="Send"], [aria-label*="Send"]');
          if (sendButtons?.length > 0) sendButtons[0].click();
        }
        setTimeout(() => { programmaticSendInProgress = false; }, 1000);
      }
    };

    TeXForGmail.sendInterceptorClick = interceptSend;
    TeXForGmail.sendInterceptorKeydown = interceptSend;
    document.addEventListener('click', interceptSend, true);
    document.addEventListener('keydown', interceptSend, true);
    TeXForGmail.log('Send interceptor initialized (click and keyboard)');
  };

  // === Cleanup ===
  TeXForGmail.cleanup = function() {
    if (TeXForGmail.observer) { TeXForGmail.observer.disconnect(); TeXForGmail.log('Main observer disconnected'); }
    if (TeXForGmail.keyboardHandler) { document.removeEventListener('keydown', TeXForGmail.keyboardHandler, true); TeXForGmail.keyboardHandler = null; TeXForGmail.log('Keyboard handler removed'); }
    if (TeXForGmail.moreMenuObserver) { TeXForGmail.moreMenuObserver.disconnect(); TeXForGmail.moreMenuObserver = null; TeXForGmail.log('More menu observer disconnected'); }
    if (TeXForGmail.sendInterceptorClick) { document.removeEventListener('click', TeXForGmail.sendInterceptorClick, true); TeXForGmail.sendInterceptorClick = null; }
    if (TeXForGmail.sendInterceptorKeydown) { document.removeEventListener('keydown', TeXForGmail.sendInterceptorKeydown, true); TeXForGmail.sendInterceptorKeydown = null; }
    if (TeXForGmail.storageChangeListener) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.removeListener === 'function') {
          chrome.storage.onChanged.removeListener(TeXForGmail.storageChangeListener);
        }
      } catch (_) { /* noop for file:// tests */ }
      TeXForGmail.storageChangeListener = null;
    }
    document.querySelectorAll('.tex-button').forEach(button => {
      const newButton = button.cloneNode(true);
      if (button.parentNode) button.parentNode.replaceChild(newButton, button);
    });
    document.querySelectorAll('.tex-read-overlay').forEach(overlay => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); });
    TeXForGmail.composeObservers = new WeakMap();
    TeXForGmail.removalObservers = new WeakMap();
    TeXForGmail.renderTimeouts = new WeakMap();
    TeXForGmail.composeButtons = new WeakMap();
    TeXForGmail.processingStates = new WeakMap();
    TeXForGmail.toggleStates = new WeakMap();
    TeXForGmail.originalContent = new WeakMap();
    TeXForGmail.sendProcessingStates = new WeakMap();
    TeXForGmail.observerSetupFlags = new WeakMap();
    TeXForGmail.log('Comprehensive cleanup completed');
  };

  window.addEventListener('beforeunload', () => { TeXForGmail.cleanup(); });
  window.addEventListener('popstate', () => {
    TeXForGmail.log('Navigation detected, performing cleanup');
    const composeAreas = document.querySelectorAll(CONFIG.composeSelectors.join(','));
    composeAreas.forEach(composeArea => { performComprehensiveCleanup(composeArea); });
  });

  TeXForGmail.storageChangeListener = (changes, areaName) => {
    if (areaName === 'sync' || areaName === 'local') {
      for (const key in changes) { if (TeXForGmail.settings) TeXForGmail.settings[key] = changes[key].newValue; }
      if (changes.dpiInline) CONFIG.dpi.inline = changes.dpiInline.newValue;
      if (changes.dpiDisplay) CONFIG.dpi.display = changes.dpiDisplay.newValue;
      if (changes.renderServer) TeXForGmail.serverPreference = changes.renderServer.newValue;
      if (changes.enableNaiveTeX) { TeXForGmail.naiveTexMode = changes.enableNaiveTeX.newValue; TeXForGmail.log(`Naive TeX mode ${TeXForGmail.naiveTexMode ? 'enabled' : 'disabled'}`); }
      if (changes.showCopyLatex && changes.showCopyLatex.newValue === false) { try { hideCopyButton(); } catch (_) {} }
      if (changes.maxApiCallsPerMinute) CONFIG.maxApiCallsPerMinute = changes.maxApiCallsPerMinute.newValue;
      if (changes.debounceDelay) {
        CONFIG.debounceDelay = changes.debounceDelay.newValue;
        CONFIG.renderDebounceDelay = changes.debounceDelay.newValue;
      }
      TeXForGmail.log('Settings updated from options page:', changes);
    }
  };
  if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.onChanged.addListener(TeXForGmail.storageChangeListener);

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
      if (request.type === 'SETTINGS_UPDATED') {
        TeXForGmail.settings = request.settings;
        TeXForGmail.log('Settings updated via message:', request.settings);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => TeXForGmail.init());
  else TeXForGmail.init();

  // Expose functions for testing on test pages
  if (window.location.pathname.includes('test') || window.location.pathname.includes('Test')) {
    console.log('TeX for Gmail: Test mode detected, exposing functions globally');
    window.TeXForGmail = TeXForGmail;
    window.ServerHealth = ServerHealth;
    window.detectAndRenderLatex = detectAndRenderLatex;
    window.switchServerSafely = switchServerSafely;
    window.createMathWrapper = createMathWrapper;
    window.renderSimpleMath = renderSimpleMath;
    window.detectNaiveTeX = detectNaiveTeX;
    window.sanitizeForHTML = sanitizeForHTML;
    window.showToast = showToast;
    window.CONFIG = CONFIG;
    window.getToggleState = getToggleState;
    window.findTextNodes = findTextNodes;
    window.createTheoremWrapper = createTheoremWrapper;
    window.performComprehensiveCleanup = performComprehensiveCleanup;
    window.copyTextToClipboard = copyTextToClipboard;
    console.log('TeX for Gmail: Test functions exposed');
  }

})();
