# Troubleshooting

- **Database is not ready:** check `DATABASE_URL`, PostgreSQL connectivity, and migrations at API startup.
- **QR does not appear:** poll the pairing endpoint; ensure the process can reach WhatsApp over WebSocket and the auth volume is writable.
- **Pairing code fails:** use an international phone number in E.164 format, retry after the rate limit window, and check Linked Devices instructions in WhatsApp.
- **Session disconnects:** check provider/WhatsApp changes and reconnect. Baileys is an unofficial integration.
- **API key rejected:** create a new key, copy the secret when displayed, check revocation and `API_KEY_PEPPER` consistency.
- **Remote browser cannot reach localhost:** localhost belongs to the user's own computer; use a secure HTTPS deployment or tunnel.
