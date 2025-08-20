// Default settings configuration
const DEFAULT_SETTINGS = {
    sendBehavior: 'ask',        // 'always'|'never'|'ask'
    rememberSendChoice: false,   // For "ask" mode
    lastSendChoice: null,        // Cached choice
    
    // Server Settings  
    renderServer: 'codecogs',    // 'codecogs'|'wordpress'
    serverFallback: true,        // Auto-switch on failure
    
    // Image Quality
    dpiInline: 110,             // 100-400 range (better inline sizing)
    dpiDisplay: 300,            // 100-400 range
    
    // Simple Math Fonts
    simpleMathFontOutgoing: 'serif',
    simpleMathFontIncoming: 'serif',
    
    // UI Controls
    showComposeButton: true,
    showReadButton: true,
    
    // Features
    enableKeyboardShortcuts: true,
    enableNaiveTeX: false,
    enableSimpleMath: false,
    
    // Advanced
    maxApiCallsPerMinute: 60,
    debounceDelay: 500,
    debugMode: false
};

// Allowed font values for validation
const ALLOWED_FONTS = [
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'Georgia',
    'Times New Roman',
    'Times',
    'Arial',
    'Helvetica',
    'Verdana',
    'Trebuchet MS',
    'Gill Sans',
    'Noto Sans',
    'Roboto',
    'Ubuntu',
    'Courier New',
    'Courier',
    'Consolas',
    'Monaco',
    'Menlo'
];

// Error messages
const ERROR_MESSAGES = {
    DPI_RANGE: "DPI must be between 100 and 400",
    STORAGE_QUOTA: "Settings storage limit exceeded. Please reduce stored data.",
    NETWORK_SAVE: "Unable to save settings. Please check your connection and try again.",
    INVALID_FONT: "Invalid font name. Please use standard web fonts only.",
    MIGRATION_FAILED: "Unable to migrate existing settings. Default settings applied.",
    SYNC_FAILED: "Settings sync failed. Changes saved locally only.",
    INVALID_JSON: "Invalid settings file format. Please check the file and try again.",
    PERMISSION_DENIED: "Storage permission required. Please enable in extension settings."
};

// Cache for settings with TTL
let settingsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Debounce timer for save operations
let saveDebounceTimer = null;

// Initialize the options page
document.addEventListener('DOMContentLoaded', () => {
    initializeOptions();
    attachEventListeners();
    setupAccessibility();
});

// Initialize options page
async function initializeOptions() {
    showLoading(true);
    
    try {
        // Migrate settings from sessionStorage if needed
        await migrateSettings();
        
        // Load current settings
        const settings = await loadSettings();
        
        // Populate form with settings
        populateForm(settings);
        
        // Update previews
        updateAllPreviews(settings);
        
    } catch (error) {
        console.error('Failed to initialize options:', error);
        showError('Failed to load settings. Using defaults.');
        populateForm(DEFAULT_SETTINGS);
    } finally {
        showLoading(false);
    }
}

// Migrate settings from sessionStorage to chrome.storage
async function migrateSettings() {
    try {
        // Check if migration is needed
        const storageData = await chrome.storage.sync.get('migrated');
        if (storageData.migrated) {
            return; // Already migrated
        }
        
        // Check for old sessionStorage data (this would be in content script)
        // For now, we'll just mark as migrated
        await chrome.storage.sync.set({ migrated: true });
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw new Error(ERROR_MESSAGES.MIGRATION_FAILED);
    }
}

// Load settings from chrome.storage
async function loadSettings() {
    // Check cache first
    if (settingsCache && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        return settingsCache;
    }
    
    try {
        // Try sync storage first
        let settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        
        // If empty, try local storage
        if (!settings || Object.keys(settings).length === 0) {
            settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
        }
        
        // Merge with defaults to ensure all keys exist
        settings = { ...DEFAULT_SETTINGS, ...settings };
        
        // Update cache
        settingsCache = settings;
        cacheTimestamp = Date.now();
        
        return settings;
        
    } catch (error) {
        console.error('Failed to load settings:', error);
        return DEFAULT_SETTINGS;
    }
}

// Save settings to chrome.storage
async function saveSettings(settings) {
    try {
        // Validate settings first
        const validation = validateSettings(settings);
        if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
        }
        
        // Try to save to sync storage
        try {
            await chrome.storage.sync.set(settings);
        } catch (syncError) {
            // If sync storage fails (quota exceeded), use local storage
            console.warn('Sync storage failed, using local storage:', syncError);
            await chrome.storage.local.set(settings);
            showWarning(ERROR_MESSAGES.SYNC_FAILED);
        }
        
        // Update cache
        settingsCache = settings;
        cacheTimestamp = Date.now();
        
        // Notify all tabs about settings change
        notifySettingsChange(settings);
        
        return true;
        
    } catch (error) {
        console.error('Failed to save settings:', error);
        throw error;
    }
}

// Validate settings
function validateSettings(settings) {
    const errors = [];
    
    // Validate DPI ranges
    if (settings.dpiInline < 100 || settings.dpiInline > 400) {
        errors.push(`Inline ${ERROR_MESSAGES.DPI_RANGE}`);
    }
    
    if (settings.dpiDisplay < 100 || settings.dpiDisplay > 400) {
        errors.push(`Display ${ERROR_MESSAGES.DPI_RANGE}`);
    }
    
    // Validate font names
    if (!validateFont(settings.simpleMathFontOutgoing)) {
        errors.push(`Outgoing font: ${ERROR_MESSAGES.INVALID_FONT}`);
    }
    
    if (!validateFont(settings.simpleMathFontIncoming)) {
        errors.push(`Incoming font: ${ERROR_MESSAGES.INVALID_FONT}`);
    }
    
    // Validate send behavior
    if (!['always', 'never', 'ask'].includes(settings.sendBehavior)) {
        errors.push('Invalid send behavior option');
    }
    
    // Validate server
    if (!['codecogs', 'wordpress'].includes(settings.renderServer)) {
        errors.push('Invalid render server option');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// Validate and sanitize font name
function validateFont(fontName) {
    if (!fontName) return false;
    
    // First, sanitize the input to remove any potential malicious content
    const sanitized = fontName
        .toString() // Ensure it's a string
        .replace(/[<>\"'`]/g, '') // Remove potential HTML/JS injection characters
        .replace(/[^a-zA-Z0-9\s\-]/g, '') // Keep only alphanumeric, spaces, and hyphens
        .trim()
        .substring(0, 50); // Limit length to prevent DoS
    
    // Check against allowed fonts (case-insensitive)
    const normalizedFont = sanitized.toLowerCase();
    return ALLOWED_FONTS.some(font => font.toLowerCase() === normalizedFont);
}

// Sanitize font name for safe usage
function sanitizeFontName(fontName) {
    if (!fontName) return 'serif'; // Default fallback
    
    // Remove any potential CSS injection vectors
    return fontName
        .toString()
        .replace(/[<>\"'`]/g, '')
        .replace(/[^a-zA-Z0-9\s\-]/g, '')
        .trim()
        .substring(0, 50);
}

// Populate form with settings
function populateForm(settings) {
    // Send behavior
    const sendBehaviorRadio = document.querySelector(`input[name="sendBehavior"][value="${settings.sendBehavior}"]`);
    if (sendBehaviorRadio) sendBehaviorRadio.checked = true;
    
    // Server settings
    document.getElementById('renderServer').value = settings.renderServer;
    
    // DPI settings
    document.getElementById('dpiInline').value = settings.dpiInline;
    document.getElementById('dpiInlineValue').textContent = settings.dpiInline;
    
    document.getElementById('dpiDisplay').value = settings.dpiDisplay;
    document.getElementById('dpiDisplayValue').textContent = settings.dpiDisplay;
    
    // Font settings
    document.getElementById('simpleMathFontOutgoing').value = settings.simpleMathFontOutgoing;
    document.getElementById('simpleMathFontIncoming').value = settings.simpleMathFontIncoming;
    
    // UI controls
    document.getElementById('showComposeButton').checked = settings.showComposeButton;
    document.getElementById('showReadButton').checked = settings.showReadButton;
    document.getElementById('enableKeyboardShortcuts').checked = settings.enableKeyboardShortcuts;
    
    // Advanced features
    document.getElementById('enableNaiveTeX').checked = settings.enableNaiveTeX;
    document.getElementById('enableSimpleMath').checked = settings.enableSimpleMath;
}

// Get form values as settings object
function getFormValues() {
    return {
        sendBehavior: document.querySelector('input[name="sendBehavior"]:checked').value,
        renderServer: document.getElementById('renderServer').value,
        dpiInline: parseInt(document.getElementById('dpiInline').value),
        dpiDisplay: parseInt(document.getElementById('dpiDisplay').value),
        simpleMathFontOutgoing: document.getElementById('simpleMathFontOutgoing').value.trim(),
        simpleMathFontIncoming: document.getElementById('simpleMathFontIncoming').value.trim(),
        showComposeButton: document.getElementById('showComposeButton').checked,
        showReadButton: document.getElementById('showReadButton').checked,
        enableKeyboardShortcuts: document.getElementById('enableKeyboardShortcuts').checked,
        enableNaiveTeX: document.getElementById('enableNaiveTeX').checked,
        enableSimpleMath: document.getElementById('enableSimpleMath').checked,
        // Preserve other settings not in the form
        ...settingsCache,
        // Override with form values
        sendBehavior: document.querySelector('input[name="sendBehavior"]:checked').value,
        renderServer: document.getElementById('renderServer').value,
        dpiInline: parseInt(document.getElementById('dpiInline').value),
        dpiDisplay: parseInt(document.getElementById('dpiDisplay').value),
        simpleMathFontOutgoing: document.getElementById('simpleMathFontOutgoing').value.trim(),
        simpleMathFontIncoming: document.getElementById('simpleMathFontIncoming').value.trim(),
        showComposeButton: document.getElementById('showComposeButton').checked,
        showReadButton: document.getElementById('showReadButton').checked,
        enableKeyboardShortcuts: document.getElementById('enableKeyboardShortcuts').checked,
        enableNaiveTeX: document.getElementById('enableNaiveTeX').checked,
        enableSimpleMath: document.getElementById('enableSimpleMath').checked
    };
}

// Attach event listeners
function attachEventListeners() {
    // Save button
    document.getElementById('saveButton').addEventListener('click', handleSave);
    
    // Reset button
    document.getElementById('resetButton').addEventListener('click', handleReset);
    
    // DPI sliders
    document.getElementById('dpiInline').addEventListener('input', (e) => {
        document.getElementById('dpiInlineValue').textContent = e.target.value;
        e.target.setAttribute('aria-valuenow', e.target.value);
        updateInlinePreview(e.target.value);
    });
    
    document.getElementById('dpiDisplay').addEventListener('input', (e) => {
        document.getElementById('dpiDisplayValue').textContent = e.target.value;
        e.target.setAttribute('aria-valuenow', e.target.value);
        updateDisplayPreview(e.target.value);
    });
    
    // Font inputs with debounced validation
    document.getElementById('simpleMathFontOutgoing').addEventListener('input', (e) => {
        debounceValidation(() => {
            validateFontInput(e.target, 'fontOutgoingError');
            updateFontPreview('fontOutgoingPreview', e.target.value);
        });
    });
    
    document.getElementById('simpleMathFontIncoming').addEventListener('input', (e) => {
        debounceValidation(() => {
            validateFontInput(e.target, 'fontIncomingError');
            updateFontPreview('fontIncomingPreview', e.target.value);
        });
    });
    
    // Listen for Enter key on form
    document.getElementById('optionsForm').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.type !== 'textarea') {
            e.preventDefault();
            handleSave();
        }
    });
}

// Handle save button click
async function handleSave() {
    const saveButton = document.getElementById('saveButton');
    saveButton.disabled = true;
    
    try {
        const settings = getFormValues();
        await saveSettings(settings);
        showSuccess('Settings saved successfully!');
    } catch (error) {
        showError(error.message || 'Failed to save settings');
    } finally {
        saveButton.disabled = false;
    }
}

// Handle reset button click
async function handleReset() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        try {
            await saveSettings(DEFAULT_SETTINGS);
            populateForm(DEFAULT_SETTINGS);
            updateAllPreviews(DEFAULT_SETTINGS);
            showSuccess('Settings reset to defaults');
        } catch (error) {
            showError('Failed to reset settings');
        }
    }
}

// Debounce validation
function debounceValidation(callback, delay = 500) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(callback, delay);
}

// Validate font input field
function validateFontInput(input, errorElementId) {
    const errorElement = document.getElementById(errorElementId);
    const originalValue = input.value.trim();
    
    if (!originalValue) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        errorElement.textContent = 'Font name is required';
        errorElement.classList.add('show');
        
        // Announce error to screen readers
        const errorRegion = document.getElementById('error-region');
        if (errorRegion) {
            errorRegion.textContent = 'Font name is required';
            setTimeout(() => errorRegion.textContent = '', 3000);
        }
        return false;
    }
    
    // Sanitize the input
    const sanitized = sanitizeFontName(originalValue);
    
    // Check if sanitization changed the value (potential attack)
    if (sanitized !== originalValue) {
        input.value = sanitized; // Auto-correct the value
        showWarning('Font name contained invalid characters and was corrected');
    }
    
    if (!validateFont(sanitized)) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        errorElement.textContent = ERROR_MESSAGES.INVALID_FONT + '. Allowed: ' + ALLOWED_FONTS.join(', ');
        errorElement.classList.add('show');
        
        // Announce error to screen readers
        const errorRegion = document.getElementById('error-region');
        if (errorRegion) {
            errorRegion.textContent = ERROR_MESSAGES.INVALID_FONT;
            setTimeout(() => errorRegion.textContent = '', 3000);
        }
        return false;
    }
    
    input.classList.remove('error');
    input.setAttribute('aria-invalid', 'false');
    errorElement.classList.remove('show');
    errorElement.textContent = '';
    return true;
}

// Update all previews
function updateAllPreviews(settings) {
    updateInlinePreview(settings.dpiInline);
    updateDisplayPreview(settings.dpiDisplay);
    updateFontPreview('fontOutgoingPreview', settings.simpleMathFontOutgoing);
    updateFontPreview('fontIncomingPreview', settings.simpleMathFontIncoming);
}

// Update inline equation preview
function updateInlinePreview(dpi) {
    const preview = document.getElementById('inlinePreview');
    const server = document.getElementById('renderServer').value;
    
    if (server === 'codecogs') {
        // Inline mode: no style prefix; rely on DPI for sizing
        preview.src = `https://latex.codecogs.com/svg.image?\\dpi{${dpi}}E=mc^2`;
    } else {
        preview.src = `https://s0.wp.com/latex.php?latex=E%3Dmc%5E2&bg=ffffff&fg=000000&s=${Math.round(dpi/100)}`;
    }
    
    preview.alt = 'E=mc²';
}

// Update display equation preview
function updateDisplayPreview(dpi) {
    const preview = document.getElementById('displayPreview');
    const server = document.getElementById('renderServer').value;
    
    if (server === 'codecogs') {
        preview.src = `https://latex.codecogs.com/svg.image?\\dpi{${dpi}}\\displaystyle\\int_{0}^{\\infty}e^{-x^2}dx=\\frac{\\sqrt{\\pi}}{2}`;
    } else {
        preview.src = `https://s0.wp.com/latex.php?latex=%5Cint_%7B0%7D%5E%7B%5Cinfty%7De%5E%7B-x%5E2%7Ddx%3D%5Cfrac%7B%5Csqrt%7B%5Cpi%7D%7D%7B2%7D&bg=ffffff&fg=000000&s=${Math.round(dpi/100)}`;
    }
    
    preview.alt = '∫₀^∞ e^(-x²) dx = √π/2';
}

// Update font preview
function updateFontPreview(previewId, fontFamily) {
    const preview = document.getElementById(previewId);
    if (preview && fontFamily) {
        preview.style.fontFamily = fontFamily;
    }
}

// Show loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    const form = document.getElementById('optionsForm');
    
    if (show) {
        if (spinner) spinner.classList.add('show');
        if (form) form.style.opacity = '0.5';
        
        // Update aria-live region for loading state
        const statusRegion = document.getElementById('status-region');
        if (statusRegion) {
            statusRegion.textContent = 'Loading settings, please wait...';
        }
    } else {
        if (spinner) spinner.classList.remove('show');
        if (form) form.style.opacity = '1';
        
        // Update aria-live region
        const statusRegion = document.getElementById('status-region');
        if (statusRegion) {
            statusRegion.textContent = 'Settings loaded successfully';
            setTimeout(() => {
                statusRegion.textContent = '';
            }, 2000);
        }
    }
}

// Show success message
function showSuccess(message) {
    // Update visual success element if it exists
    const successElement = document.getElementById('successMessage');
    if (successElement) {
        successElement.textContent = message;
        successElement.classList.add('show');
        
        setTimeout(() => {
            successElement.classList.remove('show');
        }, 3000);
    }
    
    // Update aria-live region for screen readers
    const statusRegion = document.getElementById('status-region');
    if (statusRegion) {
        statusRegion.textContent = message;
        // Clear after announcement
        setTimeout(() => {
            statusRegion.textContent = '';
        }, 4000);
    }
}

// Show error message
function showError(message) {
    // Update aria-live region for screen readers (assertive for errors)
    const errorRegion = document.getElementById('error-region');
    if (errorRegion) {
        errorRegion.textContent = 'Error: ' + message;
        // Clear after announcement
        setTimeout(() => {
            errorRegion.textContent = '';
        }, 5000);
    }
    
    // Visual feedback - show in error element if exists
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        
        setTimeout(() => {
            errorElement.classList.remove('show');
        }, 5000);
    } else {
        // Fallback to alert if no error element
        alert('Error: ' + message);
    }
    
    // Also log to console for debugging
    console.error('Settings Error:', message);
}

// Show warning message
function showWarning(message) {
    console.warn(message);
    // Could show a less intrusive warning UI element
}

// Notify all tabs about settings change
function notifySettingsChange(settings) {
    // Send message to all tabs
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes('mail.google.com')) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'SETTINGS_UPDATED',
                    settings: settings
                }).catch(() => {
                    // Tab might not have content script loaded
                });
            }
        });
    });
}

// Setup accessibility features
function setupAccessibility() {
    // Handle keyboard navigation for radio groups
    const radioGroups = document.querySelectorAll('[role="radiogroup"]');
    radioGroups.forEach(group => {
        const radios = group.querySelectorAll('input[type="radio"]');
        radios.forEach((radio, index) => {
            radio.addEventListener('keydown', (e) => {
                let newIndex = index;
                
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    newIndex = (index + 1) % radios.length;
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    newIndex = (index - 1 + radios.length) % radios.length;
                }
                
                if (newIndex !== index) {
                    radios[newIndex].focus();
                    radios[newIndex].checked = true;
                }
            });
        });
    });
    
    // Announce save success to screen readers
    const successElement = document.getElementById('successMessage');
    successElement.setAttribute('role', 'status');
    successElement.setAttribute('aria-live', 'polite');
}

// Listen for storage changes from other contexts
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' || areaName === 'local') {
        // Update form if another tab changed settings
        const newSettings = {};
        for (const key in changes) {
            newSettings[key] = changes[key].newValue;
        }
        
        // Merge with current settings
        const mergedSettings = { ...settingsCache, ...newSettings };
        
        // Update cache
        settingsCache = mergedSettings;
        cacheTimestamp = Date.now();
        
        // Update form
        populateForm(mergedSettings);
        updateAllPreviews(mergedSettings);
        
        // Show notification
        showSuccess('Settings updated from another tab');
    }
});
