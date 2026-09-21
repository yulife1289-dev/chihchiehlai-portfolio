# Portfolio visit Worker

`POST /visit` is the only public application route. It accepts the fixed `{ "page": "..." }` shape from the portfolio, validates an exact page whitelist, and forwards a new fixed payload to the local relay. The browser never receives the ngrok URL or either HMAC secret.

## Secrets

Configure these only through Wrangler after authenticating:

- `NGROK_WEBHOOK_URL` — the existing, fixed ngrok webhook URL.
- `RELAY_HMAC_SECRET` — a random shared value also held by the local relay in macOS Keychain.

Never add `.dev.vars`, secrets, webhook URLs, or generated credentials to Git.

## Limits and privacy

- Request bodies are streamed and capped at 512 bytes.
- The Worker keeps no application visitor log and forwards no IP address. The visitor limiter uses a SHA-256-derived request key only within Cloudflare's rate-limit window.
- `VISITOR_RATE_LIMITER` permits four requests per minute per short-lived key; `NOTIFICATION_BUDGET` permits five forwards per minute per Cloudflare location.
- Cloudflare Workers Rate Limiting is intentionally local to a Cloudflare location and eventually consistent. It is an abuse brake, **not** a strict global quota. The local n8n workflow retains its separate persisted ten-minute notification cooldown.

## Local tests

```sh
/opt/homebrew/opt/node@22/bin/node --test test/worker.test.mjs
```

The tests cover the normal path, bad Origin, unknown/arbitrary input, streamed oversized input, bad method, rate limiting, and non-leaking upstream failure. Relay HMAC/replay tests run with the local relay because its secret is intentionally not in this repository.
