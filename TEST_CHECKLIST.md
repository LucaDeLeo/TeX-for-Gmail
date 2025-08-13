# TeX for Gmail - Manual Test Checklist

## Purpose
This document provides a comprehensive testing protocol for TeX for Gmail extension. All tests should be performed before releases and after significant changes.

## Test Environment Setup

### Prerequisites
- [ ] Chrome browser version 88 or higher
- [ ] Gmail account with new interface
- [ ] Internet connection for API calls
- [ ] Chrome DevTools familiarity
- [ ] Test content prepared (see below)

### Installation Verification
- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] No console errors on Gmail load
- [ ] Content script injected (`TeXForGmail` object exists in console)

### Test Content
```latex
Basic inline: $E = mc^2$
Complex inline: $\sum_{i=1}^{n} x_i = \frac{n(n+1)}{2}$
Display equation: $$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$
Matrix: $$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$
Currency test: The price is $50 and $100
Code block test: <code>Use $x^2$ for superscript</code>
Multiple inline: $a^2$ and $b^2$ make $c^2$
```

---

## 🔍 Core Functionality Tests

### 1. Extension Initialization
- [ ] Open Gmail (mail.google.com)
- [ ] Check console for "🚀 TeX for Gmail: Extension initializing..."
- [ ] Verify no error messages in console
- [ ] Check that extension icon appears in Chrome toolbar

### 2. Compose Window Detection
- [ ] Click "Compose" to open new email
- [ ] TeX button (📐) appears in toolbar within 2 seconds
- [ ] Button shows green "TeX ON" state initially
- [ ] Button has hover tooltip
- [ ] Button is clickable and not disabled

### 3. Basic LaTeX Rendering
- [ ] Type: `The equation $E = mc^2$ is famous`
- [ ] Wait 500ms after typing stops
- [ ] Equation renders as image
- [ ] Original text is replaced with rendered image
- [ ] No visual glitches or layout issues

### 4. Toggle Functionality
- [ ] Click TeX button to toggle OFF
- [ ] Button changes to gray "TeX OFF"
- [ ] Rendered equations revert to source
- [ ] Toast notification appears
- [ ] Click again to toggle ON
- [ ] Equations re-render correctly
- [ ] All equations render (not just some)

### 5. Send Interceptor
- [ ] Toggle OFF (gray button)
- [ ] Type LaTeX: `$x^2 + y^2 = z^2$`
- [ ] Click Send button
- [ ] Equations automatically render before send
- [ ] Email sends successfully
- [ ] Source view restored after send (if toggle was OFF)

---

## 🎯 Advanced Feature Tests

### 6. Cursor Preservation
- [ ] Type text with LaTeX in middle
- [ ] Place cursor before LaTeX
- [ ] Toggle OFF then ON
- [ ] Cursor remains before LaTeX
- [ ] Place cursor after LaTeX
- [ ] Toggle OFF then ON
- [ ] Cursor remains after LaTeX
- [ ] Select text across LaTeX
- [ ] Toggle preserves selection

### 7. Multiple Equations
- [ ] Type: `First $a^2$ and second $b^2$`
- [ ] Both equations render
- [ ] Toggle OFF - both revert
- [ ] Toggle ON - both render again
- [ ] No equations skipped

### 8. Display vs Inline Math
- [ ] Type inline: `$x = 5$`
- [ ] Type display: `$$x = 5$$`
- [ ] Inline renders in-line with text
- [ ] Display renders as centered block
- [ ] Both toggle correctly

### 9. Code Block Protection
- [ ] Type: `<code>$not rendered$</code>`
- [ ] LaTeX in code block NOT rendered
- [ ] Type: `<pre>Tutorial: $x^2$</pre>`
- [ ] LaTeX in pre block NOT rendered
- [ ] Regular LaTeX outside blocks still renders

### 10. Currency Detection
- [ ] Type: `The cost is $50 and $100.99`
- [ ] Currency amounts NOT rendered
- [ ] Type: `Let $x = 50$ be the value`
- [ ] Mathematical expression IS rendered
- [ ] Type: `$1,000 USD`
- [ ] Currency NOT rendered

---

## 🔨 Stress Tests

### 11. Rapid Toggle Clicking
- [ ] Click toggle button 10 times rapidly
- [ ] No errors in console
- [ ] No state corruption
- [ ] Button shows "Processing..." during operation
- [ ] Final state is consistent

### 12. Multiple Compose Windows
- [ ] Open 3 compose windows
- [ ] Each has independent TeX button
- [ ] Toggle states are independent
- [ ] Rendering works in all windows
- [ ] Close windows - no console errors

### 13. Large Content
- [ ] Paste 20+ equations
- [ ] All equations render (may take time)
- [ ] Toggle works without hanging
- [ ] Performance acceptable (<5 seconds)

### 14. Memory Leak Test
- [ ] Open Chrome DevTools Memory tab
- [ ] Take heap snapshot
- [ ] Open and close 5 compose windows
- [ ] Take another heap snapshot
- [ ] Memory increase < 5MB
- [ ] No detached DOM nodes

### 15. Race Condition Test
- [ ] Type LaTeX quickly
- [ ] Immediately click toggle
- [ ] No errors or corruption
- [ ] Type more LaTeX
- [ ] Immediately click Send
- [ ] Send completes successfully

---

## 🌐 Compatibility Tests

### 16. Gmail Variants
- [ ] Test in regular Gmail view
- [ ] Test in full-screen compose
- [ ] Test in pop-out compose window
- [ ] Test in minimized compose
- [ ] Test with chat panel open

### 17. Dark Mode (Known Issue)
- [ ] Enable Gmail dark theme
- [ ] Render equations
- [ ] Note: White backgrounds expected (known limitation)
- [ ] Equations still readable
- [ ] No other visual issues

### 18. Keyboard Shortcuts
- [ ] Type LaTeX content
- [ ] Press Ctrl+Enter (Windows) or Cmd+Enter (Mac)
- [ ] Send interceptor triggers if toggle OFF
- [ ] Email sends with rendered math

### 19. Draft Saving
- [ ] Compose email with LaTeX
- [ ] Let Gmail auto-save draft
- [ ] Close compose window
- [ ] Reopen draft
- [ ] TeX button appears
- [ ] Can toggle and render

### 20. Reply/Forward
- [ ] Reply to an email
- [ ] TeX button appears in reply
- [ ] Type and render LaTeX
- [ ] Forward an email
- [ ] TeX button appears
- [ ] LaTeX rendering works

---

## 🐛 Error Handling Tests

### 21. Network Errors
- [ ] Disconnect internet
- [ ] Try to render LaTeX
- [ ] Graceful error (no crash)
- [ ] Error logged in console
- [ ] Reconnect internet
- [ ] Rendering works again

### 22. Invalid LaTeX
- [ ] Type: `$\invalid \latex$`
- [ ] No crash or hang
- [ ] Error may be logged
- [ ] Other valid LaTeX still renders

### 23. Rate Limiting
- [ ] Create 60+ different equations quickly
- [ ] After 60, rate limit message appears
- [ ] Wait 1 minute
- [ ] Rendering works again

### 24. API Timeout
- [ ] Type very complex LaTeX
- [ ] If timeout, graceful handling
- [ ] No infinite loading
- [ ] Can still toggle and use extension

---

## 📊 Performance Tests

### 25. Initial Load Time
- [ ] Clear browser cache
- [ ] Load Gmail
- [ ] Time from page load to extension ready
- [ ] Should be < 2 seconds

### 26. Render Performance
- [ ] Type simple equation: `$x$`
- [ ] Time from typing stop to render
- [ ] Should be ~500-700ms (debounce + API)

### 27. Toggle Performance
- [ ] Have 10 equations rendered
- [ ] Time toggle operation
- [ ] Should be < 500ms

### 28. Memory Usage
- [ ] Check Chrome Task Manager
- [ ] Extension memory < 50MB normal use
- [ ] No continuous memory growth

---

## 🔒 Security Tests

### 29. XSS Prevention
- [ ] Type: `$<script>alert('xss')</script>$`
- [ ] No script execution
- [ ] Safe handling or rejection

### 30. Content Injection
- [ ] Check page source
- [ ] No inline scripts added
- [ ] CSP compliance maintained

---

## 📝 Final Verification

### 31. Console Check
- [ ] No red errors in console
- [ ] Warnings documented if any
- [ ] Debug messages appropriate

### 32. Visual Polish
- [ ] Buttons aligned properly
- [ ] Toast notifications positioned correctly
- [ ] No visual glitches
- [ ] Smooth animations

### 33. User Experience
- [ ] Features discoverable
- [ ] Feedback clear (toasts, button states)
- [ ] No surprising behavior
- [ ] Recovery from errors possible

---

## 🚀 Release Checklist

Before marking as production-ready:

- [ ] All core functionality tests pass
- [ ] No critical bugs found
- [ ] Performance acceptable
- [ ] Memory leaks verified absent
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version number bumped
- [ ] README.md current

---

## 📋 Test Results Template

```markdown
## Test Run: [DATE]
**Tester:** [Name]
**Chrome Version:** [Version]
**Gmail Type:** [Standard/Workspace]
**OS:** [Windows/Mac/Linux]

### Results Summary
- Core Tests: X/5 passed
- Advanced Tests: X/5 passed  
- Stress Tests: X/5 passed
- Compatibility: X/5 passed
- Error Handling: X/4 passed
- Performance: X/4 passed
- Security: X/2 passed

### Issues Found
1. [Issue description]
   - Steps to reproduce
   - Expected vs actual
   - Severity: [Critical/High/Medium/Low]

### Notes
[Any additional observations]
```

---

## 🔧 Debugging Tips

### Enable Debug Mode
```javascript
// In console:
TeXForGmail.debugMode = true
```

### Check Extension State
```javascript
// View current states:
console.log(TeXForGmail.toggleStates);
console.log(TeXForGmail.composeObservers);
console.log(TeXForGmail.renderTimeouts);
```

### Force Cleanup
```javascript
// If needed:
performComprehensiveCleanup(document.querySelector('[contenteditable="true"]'));
```

---

*Last Updated: 2025-08-13*  
*For automated testing, see test-*.html files in tests/ directory*