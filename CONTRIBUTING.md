# Contributing

Use Node.js 20+, keep provider-specific code behind `WhatsAppProvider`, add tests for security and ownership behavior, and never include credentials, session files, or message content in logs or fixtures. Run `npm run typecheck`, `npm test`, and `npm run build` before submitting changes. Real provider connectivity must be tested manually with an authorized account and described separately from mocked CI tests.
