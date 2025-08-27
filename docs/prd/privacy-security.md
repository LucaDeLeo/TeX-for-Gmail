# 🔒 Privacy & Security

## 4.1 Privacy Policy

- **No Data Collection:** Extension does not collect any user information
- **External Services:** Mathematical formulas in outgoing messages replaced by links to images created and controlled by:
  - CodeCogs (https://www.codecogs.com/latex/eqneditor.php)
  - WordPress (https://wordpress.com/)
- **Data Transmission:** Only LaTeX code sent to rendering services
- **Storage:** User preferences stored locally via Chrome storage API

## 4.2 Security Requirements

- **Input Validation:** LaTeX sanitization to prevent injection
- **HTTPS Only:** All API calls over secure connection
- **Permissions:** Minimal scope (activeTab, storage)
- **Content Security:** No execution of user-provided code
