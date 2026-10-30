# API reference

The machine-readable OpenAPI contract is [`openapi.yaml`](openapi.yaml). The API listens under `/api/v1`. JSON errors use `{ "error": { "code", "message" } }`. Dashboard routes use an HTTP-only session cookie; programmatic message sending uses a `Bearer` API key.

## Authentication

- `POST /auth/register` — `{ "email", "password" }`, password minimum 12 characters.
- `POST /auth/login` — same body; session cookie is set.
- `POST /auth/logout` — invalidates the dashboard session.
- `GET /auth/me` — current user.

## Sessions

- `POST /sessions` — `{ "name" }`.
- `GET /sessions`, `GET /sessions/{id}` — owner-filtered session list/details.
- `POST /sessions/{id}/pairing/qr` — starts QR pairing; poll `GET /sessions/{id}/pairing/qr` for the data URL. QR tokens are secrets: do not share screenshots or log them.
- `POST /sessions/{id}/pairing/phone` — `{ "phone": "+919876543210" }`; pairing is limited to five attempts per user/hour.
- `POST /sessions/{id}/reconnect`, `POST /sessions/{id}/logout`, `DELETE /sessions/{id}`.

## API keys and messages

- `POST /api-keys` — `{ "name", "sessionId" }`. The full secret is returned once; only a peppered SHA-256 digest is stored.
- `GET /api-keys` — metadata, never secrets.
- `DELETE /api-keys/{id}` — revoke.
- `POST /messages/send` — Bearer key and `{ "sessionId", "to", "type":"text", "message" }`; optional `Idempotency-Key` header.
- `GET /messages`, `GET /messages/{id}` — dashboard-session history.
- `GET /health`, `GET /ready` — liveness and DB readiness.

`sent` means the provider returned an accepted message ID. This build does not consume acknowledgement events, so it never reports delivered/read. It accepts text only. Media, webhooks, Cloud API, and admin management are not implemented.

### cURL

```sh
curl --connect-timeout 5 --max-time 20 -X POST "$PUFFX_BASE_URL/api/v1/messages/send" \
  -H "Authorization: Bearer $PUFFX_API_KEY" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-123' \
  -d '{"sessionId":"SESSION_UUID","to":"919876543210","type":"text","message":"Your order is confirmed."}'
```

### PHP

```php
<?php
$ch = curl_init(getenv('PUFFX_BASE_URL').'/api/v1/messages/send');
curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_TIMEOUT=>20,
  CURLOPT_HTTPHEADER=>['Authorization: Bearer '.getenv('PUFFX_API_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS=>json_encode(['sessionId'=>getenv('PUFFX_SESSION_ID'),'to'=>'919876543210','type'=>'text','message'=>'Your order is confirmed.'])]);
$body=curl_exec($ch); if ($body===false) throw new RuntimeException(curl_error($ch));
$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch); if ($status>=400) throw new RuntimeException("Gateway returned HTTP $status: $body");
```

### Python

```python
import os, requests
r = requests.post(os.environ['PUFFX_BASE_URL'] + '/api/v1/messages/send',
  headers={'Authorization': 'Bearer ' + os.environ['PUFFX_API_KEY']},
  json={'sessionId': os.environ['PUFFX_SESSION_ID'], 'to': '919876543210', 'type': 'text', 'message': 'Your order is confirmed.'}, timeout=(5, 20))
r.raise_for_status(); print(r.json())
```

### Node.js

```js
const response = await fetch(
  `${process.env.PUFFX_BASE_URL}/api/v1/messages/send`,
  {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${process.env.PUFFX_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sessionId: process.env.PUFFX_SESSION_ID,
      to: "919876543210",
      type: "text",
      message: "Your order is confirmed.",
    }),
  },
);
if (!response.ok)
  throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
console.log(await response.json());
```

Browser apps must call their own backend proxy; never ship a gateway API key in browser JavaScript.
