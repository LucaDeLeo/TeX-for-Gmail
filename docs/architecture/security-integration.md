# Security Integration

## Existing Security Measures
- Authentication: None (anonymous HTTP GET to external renderers when enabled)
- Authorization: N/A (extension‑local)
- Data Protection: LaTeX content is transmitted to third‑party services (see README privacy notice); no sensitive storage
- Security Tools: Chrome extension isolation; internal sanitization routines for HTML injection in Simple Math mode

## Enhancement Security Requirements
- New Security Measures: Enforce strict endpoint allowlist and timeouts; expose a setting to disable external rendering (use Simple Math only) if users require no data egress
- Integration Points: Rendering logic enforces whitelist of external endpoints; sanitize all DOM insertions; avoid `innerHTML` where unsafe
- Compliance Requirements: Maintain least‑privilege permissions; no additional host permissions beyond Gmail; no `scripting` permission unless necessary
- CSP/Assets: If local renderer is added in the future, ship assets within the extension; avoid remote asset loading
- Network Policy: Enforce timeout/backoff; no arbitrary remote calls; restrict to known domains
- Storage/PII: No user PII; validate and clamp options; document any new keys and add versioned migration

## Security Testing
- Existing Security Tests: Manual validation via harness; confirm no rendering requests are sent when local‑only mode is enabled
- New Security Test Requirements: Domain allowlist checks; DOM injection safety (no `eval`, safe node creation); verify no network in offline scenarios
- Penetration Testing: Ad‑hoc review focused on Gmail DOM injection, content sanitization, and permission surface
