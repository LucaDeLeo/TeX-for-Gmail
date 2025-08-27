# 📚 Appendices

## A. Technical Decisions Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Dual server support | Reliability and feature balance | 2025-08 |
| HTML fallback mode | Offline capability | 2025-08 |
| Manifest V3 | Future-proof, required by Chrome | 2025-07 |
| No background worker | Simplicity, all logic in content | 2025-07 |
| Green highlight color | Brand recognition from v1 | 2025-07 |
| Keyboard shortcuts | Power user efficiency | 2025-08 |

## B. Risk Register

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Gmail DOM changes | High | Multiple selectors, version detection | Dev |
| API rate limits | Medium | Client-side limiting, server switching | Dev |
| Server downtime | Medium | Dual server support, offline mode | Dev |
| Browser updates | Low | Regular testing, beta channel monitoring | QA |
| LaTeX complexity | Low | Documentation, examples | Doc |

## C. Glossary

- **LaTeX:** Document preparation system for mathematical notation
- **TeX:** The underlying typesetting system
- **TFG:** TeX for Gmail (this extension)
- **CodeCogs:** Third-party LaTeX rendering service
- **WordPress:** Alternative LaTeX rendering service
- **Manifest V3:** Latest Chrome extension specification
- **Content Script:** JavaScript injected into web pages
- **DOM:** Document Object Model
- **Rich Math:** Image-based rendering mode
- **Simple Math:** HTML-based rendering mode
- **Naive TeX:** Informal mathematical notation

---

**Document Status:** UPDATED WITH FULL FEATURE SET  
**Next Review:** Post-implementation testing phase
