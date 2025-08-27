# 🎮 User Scenarios

## 6.1 Primary Use Cases

1. **Academic Email:** Professors send homework solutions with complex equations
2. **Research Collaboration:** Scientists discuss formulas in email threads
3. **Student Communication:** Students ask math questions to teachers
4. **Technical Documentation:** Engineers share specifications with formulas
5. **Quick Math Notes:** Mathematicians use naive TeX for informal communication

## 6.2 User Journey

```
1. Install Extension → Chrome Web Store
2. Open Gmail → Extension auto-initializes
3. Compose Email → TeX button appears
4. Choose Rendering Mode:
   a. Type LaTeX → Auto-renders after 500ms (nonstop mode)
   b. Type LaTeX → Click button to render (once mode)
5. Toggle View → Click button to show/hide source
6. Send Email → Recipients see rendered math
7. Read Email → Use TeX button or More menu to render received math
```

## 6.3 Edge Cases & Handling

| Scenario | Behavior | Resolution |
|----------|----------|------------|
| Invalid LaTeX | Show original text | Log error to console |
| Network failure | Keep source text | Try alternate server |
| Rate limit hit | Pause rendering | Show notification |
| Gmail update | Fallback selectors | Multiple strategies |
| Currency amounts | Don't render | Pattern exclusion |
| Server down | Switch to backup | WordPress/CodeCogs fallback |
| Mixed content | Render valid parts | Partial rendering |
