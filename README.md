# Puffx WhatsApp Gateway

Self-hosted WhatsApp messaging gateway with a web dashboard, REST API, PostgreSQL, and QR or phone pairing. You run it on your own computer or server; this GitHub repository does not provide a hosted gateway.

> **Status:** Initial beta implementation. It supports pairing a WhatsApp Web account and sending text messages. Baileys is an unofficial WhatsApp Web integration, not the official WhatsApp Business Platform. Real WhatsApp pairing and delivery behavior depend on WhatsApp and were not verified by automated tests. Review [security and limitations](docs/security.md) before exposing an instance publicly.

![Animated quick-start walkthrough: configure, run, pair, and send](basic_start.gif)

## What you need

- Docker Engine and Docker Compose (recommended), or Node.js 20.19+, npm, and PostgreSQL 14+.
- For a public server: a domain, HTTPS reverse proxy, persistent storage, and outbound WebSocket access.
- A WhatsApp account that you can pair using **Linked devices**.

## Run with Docker

This is the quickest way to start locally. In PowerShell:

```powershell
git clone https://github.com/puffxhost/puffx-whatsapp-gateway.git
Set-Location puffx-whatsapp-gateway
Copy-Item .env.example .env
```

On Linux or macOS:

```sh
git clone https://github.com/puffxhost/puffx-whatsapp-gateway.git
cd puffx-whatsapp-gateway
cp .env.example .env
```

Edit `.env` and replace `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `API_KEY_PEPPER` with unique random values. For example, generate a value with `openssl rand -hex 32` where OpenSSL is installed. Keep the two application secrets different and never commit `.env`.

Start the gateway:

```sh
docker compose up -d --build
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Check that [http://127.0.0.1:3000/api/v1/ready](http://127.0.0.1:3000/api/v1/ready) reports `ready`. Docker Compose persists the database and WhatsApp login state in named volumes.

To stop it while keeping data:

```sh
docker compose down
```

To remove the database and WhatsApp login data as well (destructive):

```sh
docker compose down -v
```

## First-time setup

1. Open the dashboard and choose **Create an account**. Use a strong password.
2. Select **Add session** and give the WhatsApp account a name.
3. Choose **QR pair** and scan the displayed QR from WhatsApp on your phone: **Settings → Linked devices → Link a device**. You can use **Pairing code** instead if needed.
4. Wait until the session status says `connected`.
5. Select **Create API key** and copy the key immediately. It is shown only once. Store it in your server-side environment or secret manager.
6. Use **Copy ID** on the session card to copy its full session UUID. You need it when sending a message.

The dashboard and API are intended to be deployed on the same origin. Do not put an API key in browser JavaScript or share QR codes, pairing codes, or WhatsApp auth files.

## Send a text message

The following example uses Bash, WSL, or Git Bash. Set these values in the same terminal where you run the command:

```sh
export PUFFX_BASE_URL="http://127.0.0.1:3000"
export PUFFX_API_KEY="paste-your-api-key"
export PUFFX_SESSION_ID="paste-session-uuid"
```

Then send a message using the recipient number with country code and digits only (no `+`, spaces, or dashes):

```sh
curl --connect-timeout 5 --max-time 20 -X POST "$PUFFX_BASE_URL/api/v1/messages/send" \
  -H "Authorization: Bearer $PUFFX_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$PUFFX_SESSION_ID\",\"to\":\"919876543210\",\"type\":\"text\",\"message\":\"Hello from Puffx!\"}"
```

The API returns `202` when the provider accepts the message. That does **not** confirm delivery or read status. See [API reference](docs/api-reference.md) for PHP, Python, Node.js, and idempotency examples.

## Run locally for development

1. Install Node.js 20.19+ and npm.
2. Copy `.env.example` to `.env` and set unique secrets.
3. Start PostgreSQL 14+ and set `DATABASE_URL` in `.env`. To run only the Compose database, use `docker compose up -d db`.
4. Install dependencies and start the API and dashboard:

   ```sh
   npm ci
   npm --prefix apps/dashboard ci
   npm run dev
   ```

5. Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The development dashboard proxies API requests to port 3000.

See [local installation](docs/installation.md) for more detail.

## Public server deployment

For a VPS, point your domain to the server and put the gateway behind an HTTPS reverse proxy. The Compose file binds port 3000 to `127.0.0.1`, so the API is not directly exposed to the internet.

1. Install Docker Compose, configure DNS for your domain, and clone this repository on the VPS.
2. Copy `.env.example` to `.env`; set unique random `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `API_KEY_PEPPER` values.
3. Set `PUBLIC_BASE_URL=https://your-domain.example` and `COOKIE_SECURE=true` in `.env`.
4. Configure Nginx or another reverse proxy with a valid TLS certificate, forwarding HTTPS requests to `127.0.0.1:3000`. The sample config is in [`docker/nginx.conf`](docker/nginx.conf).
5. Run `docker compose up -d --build`, then verify `https://your-domain.example/api/v1/ready` returns `ready`.
6. Back up both the PostgreSQL database and the `whatsapp_data` volume. Keep the DB and auth files private; expose only the HTTPS dashboard/API.

See [Docker deployment](docs/docker-deployment.md) and [VPS deployment](docs/vps-deployment.md) for proxy and backup examples. Do not invite users to a public deployment until you have reviewed [security notes](docs/security.md), configured HTTPS and strong secrets, and restricted access as needed.

## Operate the gateway

```sh
docker compose logs -f gateway       # follow application logs
docker compose ps                    # check service health
docker compose restart gateway       # restart the API
docker compose down                  # stop services, preserve data
```

To back up PostgreSQL:

```sh
docker compose exec -T db pg_dump -U puffx puffx > puffx-backup.sql
```

Also back up the `whatsapp_data` Docker volume with the gateway stopped. Treat both backups as sensitive because they contain account and session data. `docker compose down -v` permanently removes the database and WhatsApp login volume.

## API and project docs

- [OpenAPI contract](docs/openapi.yaml)
- [API examples and endpoints](docs/api-reference.md)
- [Installation](docs/installation.md)
- [Security notes and limitations](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Animated setup walkthrough](basic_start.gif)

## Current limitations

- Text messages only; no media, webhooks, Cloud API, queue, or admin console.
- Delivery/read receipts are not implemented. `sent` means accepted by the provider.
- Baileys auth state is stored on disk and is not encrypted by the application. Protect the volume and backups.
- Baileys is unofficial and may break or be restricted by WhatsApp. Use opted-in communications and comply with WhatsApp terms and local law.

## Development checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
