# Goals and Background Context

## Goals
- Enable Gmail users to write and send beautifully rendered LaTeX.
- Seamless Gmail integration without disrupting workflow.
- Universal readability for recipients without extensions.
- Flexible online (images) and offline (HTML/CSS) rendering options.
- Near real-time, performant rendering with safe defaults.

## Background Context
TeX for Gmail (TFG) augments Gmail compose and read views to recognize LaTeX patterns and render math seamlessly. It supports Rich Math via external image services (CodeCogs primary with WordPress fallback) and Simple Math via HTML/CSS for offline use. The design emphasizes minimal UI intrusion, reliability, and keeping original content recoverable.

## Change Log
| Date       | Version | Description                                                 | Author |
|------------|---------|-------------------------------------------------------------|--------|
| 2025-08-27 | 3.0.1   | Align PRD with fallback policy, DPI defaults, API updates | sm     |
| 2025-08-14 | 3.0     | PRD refresh; added v1.1 features, options, shortcuts       | PM     |
