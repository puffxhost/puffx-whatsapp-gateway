# Puffx WhatsApp Gateway

Self-hosted Node.js gateway for pairing a WhatsApp Web account with QR or phone pairing code and sending authenticated text messages through REST. It includes a React dashboard, PostgreSQL persistence, hashed single-view API keys, owner-scoped sessions, Docker Compose, and OpenAPI documentation.

## Status

Initial implementation, not a production security certification. Baileys is an unofficial WhatsApp Web integration; it is not the official WhatsApp Business Platform. Its API can break and its use may be restricted. This build supports text only; provider acknowledgements, media, webhooks, Cloud API, admin UI, full event streaming, and encryption-at-rest for Baileys auth files are not implemented. Delivery/read are never claimed. Real WhatsApp pairing requires an account and was not tested in CI.

## Quick start

Requirements: Node.js 20.19+, npm, and PostgreSQL 14+. Copy `.env.example` to `.env`, set unique random secrets, configure `DATABASE_URL`, install dependencies with `npm install` and `npm --prefix apps/dashboard install`, then run `npm run dev`. Visit `http://127.0.0.1:5173`, register, create a WhatsApp session, and select pairing. The API listens on `http://127.0.0.1:3000`. See [local installation](docs/installation.md).

For Docker: configure `.env` with strong `SESSION_SECRET`, `API_KEY_PEPPER`, and `POSTGRES_PASSWORD`, then run `docker compose up -d --build`. Persistent database and auth volumes are configured. See [Docker](docs/docker-deployment.md) and [VPS](docs/vps-deployment.md).

## Send a message

Create a key in the dashboard and retain the displayed secret securely. Example:

```sh
curl --connect-timeout 5 --max-time 20 -X POST "$PUFFX_BASE_URL/api/v1/messages/send" \
 -H "Authorization: Bearer $PUFFX_API_KEY" -H 'Content-Type: application/json' \
 -d '{"sessionId":"SESSION_UUID","to":"919876543210","type":"text","message":"Your order is confirmed."}'
```

See [API reference](docs/api-reference.md) for PHP, Python, Node.js, and proxy examples. Never place a private API key in browser JavaScript.

## Architecture and deployment

`apps/api` contains the Express API and Baileys provider adapter. `apps/dashboard` contains the React UI. `database/migrations` defines PostgreSQL records for users, sessions, API keys, messages, webhooks, audit logs, usage, and settings. The Cloud API should be a separate provider adapter with its own credentials and template/opt-in rules; QR pairing does not apply to it.

- [Windows/Linux/macOS localhost](docs/localhost.md)
- [Docker](docs/docker-deployment.md)
- [Linux VPS](docs/vps-deployment.md)
- [cPanel constraints](docs/cpanel-deployment.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## Development

Commands: `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`. Schema migration is currently applied automatically on API startup. Back up both PostgreSQL and the persistent WhatsApp auth volume; never commit either backup or `.env`.

## License

MIT. See [LICENSE](LICENSE).
