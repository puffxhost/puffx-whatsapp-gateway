# Installation

Requirements: Node.js 20.19+, npm, and PostgreSQL 14+. Baileys requires Node.js 20+; the current Vite toolchain requires Node.js 20.19+. This project uses PostgreSQL in all supported configurations.

1. Copy `.env.example` to `.env`; set two independent high-entropy secrets for `SESSION_SECRET` and `API_KEY_PEPPER`.
2. Start PostgreSQL and set `DATABASE_URL`.
3. Run `npm install`, `npm --prefix apps/dashboard install`, then `npm run dev`.
4. Open `http://127.0.0.1:5173`, register, create a session, and choose QR or phone pairing. The Vite dashboard proxies API calls to `http://127.0.0.1:3000`.

For Windows PowerShell use `Copy-Item .env.example .env`; for Linux/macOS use `cp .env.example .env`. Bind to loopback for local-only use. Localhost is normally reachable only from the same computer. Remote websites cannot call it directly without a secure tunnel/VPN or public deployment. Use HTTPS before exposing it publicly. Never commit `.env` or the `data/` session directory.
