# 📊 Non-Functional Requirements

## 5.1 Performance Requirements

| Metric | Requirement | Measurement |
|--------|------------|-------------|
| Render Time | <500ms | From detection to display |
| Extension Size | <200KB | Total package size |
| Memory Usage | <50MB | During active use |
| API Rate | ≤60/min | Enforced client-side |
| CPU Usage | <5% | During idle state |

## 5.2 Compatibility Requirements

| Component | Requirement | Notes |
|-----------|------------|-------|
| Chrome Version | 88+ | Manifest V3 support |
| Gmail Interface | New Gmail | Dynamic DOM support |
| JavaScript | ES6+ | No external libraries |
| Network | Online for Rich Math | Simple Math works offline |
| Plain Text Mode | Must be disabled | Required for rendering |

## 5.3 Reliability Requirements

- **Server Fallback:** Automatic switch between servers on failure
- **Graceful Degradation:** Fall back to Simple Math if servers unavailable
- **Error Recovery:** Show original LaTeX on render failure
- **Status Checking:** Direct server status verification links provided
 - **Timeouts & Retries:** Per-image load timeout 4–6 seconds; at most 1 retry per server
