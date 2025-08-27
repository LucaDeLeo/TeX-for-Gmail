# ⚠️ Known Issues & User Feedback

## Critical Issues Identified (2025-08-14)

Based on user feedback from JessRiedel, the following issues need addressing:

### 1. Low Resolution Rendering
**Issue:** Images are rendered at low DPI (110 for inline, 150 for display), resulting in blurry equations
**Current State:** Equations appear pixelated compared to the legacy extension
**Impact:** Poor visual quality affects readability and professional appearance
**Target Fix:** Increase DPI to 200+ for inline and 300+ for display math

### 2. Automatic Rendering on Send
**Issue:** When toggle is OFF and user sends email with LaTeX, extension automatically renders without consent
**User Expectation:** Toggle OFF should mean "don't touch my LaTeX" 
**Current Behavior:** Send interceptor forces rendering for recipient benefit
**Target Fix:** Add user preference for send behavior (always render, never render, ask each time)

### 3. Inline vs Display Mode Incorrect
**Issue:** All equations render in display mode regardless of delimiter type
**Expected:** 
- Single `$...$` should render inline (small, flows with text)
- Double `$$...$$` should render display (large, centered, own line)
**Current:** Both render as display mode with only size difference
**Target Fix:** Proper inline/display distinction with correct LaTeX mode selection; no stray `$$` delimiters in output

### 4. Baseline Alignment 
**Issue:** Inline equations don't align properly with surrounding text baseline
**Visual Impact:** Equations appear shifted up/down relative to text
**Target Fix:** Use proper vertical-align CSS and baseline positioning
