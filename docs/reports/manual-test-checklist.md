# TeX for Gmail - Manual Test Checklist

## Quick Setup
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select the TeX for Gmail directory
4. Verify extension loads without errors

---

## Basic Functionality Tests

### ☐ 1. Extension Loading
- [ ] Open Gmail (mail.google.com)
- [ ] Open DevTools Console (F12)
- [ ] Verify: "TeX for Gmail: Extension initialized" message
- [ ] Verify: No error messages in console

### ☐ 2. Compose Window Detection
- [ ] Click "Compose" button in Gmail
- [ ] Verify: TeX button appears in compose toolbar (green "📐 TeX")
- [ ] Close compose window
- [ ] Open new compose window
- [ ] Verify: TeX button appears again

### ☐ 3. Basic LaTeX Rendering
- [ ] In compose window, type: `Test equation $x^2 + y^2 = z^2$ here`
- [ ] Wait 1 second
- [ ] Verify: Math renders with green background
- [ ] Verify: Original text is replaced with image

### ☐ 4. Display Math
- [ ] Type: `$$\int_0^1 f(x) dx$$`
- [ ] Verify: Larger rendered equation appears
- [ ] Verify: Green background, proper spacing

### ☐ 5. Currency Detection
- [ ] Type: `The price is $100 dollars`
- [ ] Verify: Dollar amount NOT rendered as LaTeX
- [ ] Type: `But $x = 100$ is math`
- [ ] Verify: Second expression IS rendered

---

## Toggle Control Tests

### ☐ 6. Toggle OFF
- [ ] Click TeX button (should be green/active)
- [ ] Verify: Button becomes gray/inactive
- [ ] Verify: All rendered math reverts to source text
- [ ] Verify: Toast notification "LaTeX source restored"

### ☐ 7. Toggle ON
- [ ] Click TeX button again
- [ ] Verify: Button becomes green/active
- [ ] Verify: All LaTeX re-renders
- [ ] Verify: Toast notification "LaTeX rendering enabled"

### ☐ 8. Auto-Render When Toggle ON
- [ ] With toggle ON, type new equation: `$a^2 + b^2 = c^2$`
- [ ] Verify: Automatically renders after typing

### ☐ 9. No Auto-Render When Toggle OFF
- [ ] Click TeX button to turn OFF
- [ ] Type new equation: `$e^{i\pi} + 1 = 0$`
- [ ] Verify: Remains as plain text (not rendered)

---

## Advanced Tests

### ☐ 10. Multiple Compose Windows
- [ ] Open first compose window
- [ ] Toggle OFF in first window
- [ ] Open second compose window (shift+click Compose)
- [ ] Verify: Second window has independent toggle (starts ON)
- [ ] Type LaTeX in both windows
- [ ] Verify: First window doesn't render, second does

### ☐ 11. Send Email Behavior
- [ ] Toggle OFF
- [ ] Type: `Formula: $F = ma$`
- [ ] Click Send button
- [ ] Check Sent folder
- [ ] Verify: Email contains RENDERED math (not source)

### ☐ 12. Complex LaTeX
- [ ] Type: `$$\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u$$`
- [ ] Verify: Renders correctly
- [ ] Type: `Matrix $\begin{pmatrix} a & b \\ c & d \end{pmatrix}$`
- [ ] Verify: Renders correctly

### ☐ 13. Error Handling
- [ ] Type invalid LaTeX: `$\invalid{\latex$`
- [ ] Verify: Shows original text (doesn't crash)
- [ ] Check console for error message

### ☐ 14. Cursor Preservation
- [ ] Type: `Before $x$ | after` (| = cursor position)
- [ ] Place cursor after the word "after"
- [ ] Wait for render
- [ ] Continue typing
- [ ] Verify: Cursor stays in correct position

### ☐ 15. Rapid Typing
- [ ] Type LaTeX equations quickly
- [ ] Verify: Debouncing prevents constant re-renders
- [ ] Verify: Final result renders correctly

---

## Performance Tests

### ☐ 16. Large Email
- [ ] Paste 20+ LaTeX equations
- [ ] Verify: All render without freezing
- [ ] Toggle OFF then ON
- [ ] Verify: All equations restore/re-render

### ☐ 17. Rate Limiting
- [ ] Rapidly create many equations (60+)
- [ ] Verify: Rate limiting message in console
- [ ] Verify: Extension continues working

---

## Cleanup Tests

### ☐ 18. Memory Cleanup
- [ ] Open and close 5 compose windows
- [ ] Check DevTools Memory tab
- [ ] Verify: No memory leaks
- [ ] Verify: Buttons removed from closed windows

### ☐ 19. Extension Reload
- [ ] Make changes and reload extension
- [ ] Refresh Gmail
- [ ] Verify: Extension reinitializes properly

---

## Final Verification

### ☐ 20. Complete User Journey
- [ ] Install extension fresh
- [ ] Open Gmail
- [ ] Compose new email
- [ ] Write mixed text and LaTeX
- [ ] Toggle rendering on/off
- [ ] Send email
- [ ] Verify sent email has rendered math
- [ ] Close compose window
- [ ] Verify cleanup

---

## Sign-off

- **Date Tested:** _______________
- **Tester Name:** _______________
- **Chrome Version:** _______________
- **All Tests Passed:** ☐ Yes ☐ No
- **Notes:** _________________________________

---

## Quick Commands for Testing

```javascript
// Paste in console to check extension state
console.log('Checking TeX for Gmail state...');
document.querySelectorAll('.tex-button').forEach(b => 
  console.log('Button state:', b.getAttribute('data-toggle-state'))
);
document.querySelectorAll('.tex-math-inline, .tex-math-display').forEach(m => 
  console.log('Rendered math:', m.getAttribute('data-latex'))
);
```