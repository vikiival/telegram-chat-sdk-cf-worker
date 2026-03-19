# Telegram Chat SDK Cloudflare Worker

Minimal Telegram bot template built with Chat SDK, Hono, Zod, in-memory Chat SDK state, and Cloudflare Workers AI.

## Endpoints

- `GET /`
- `GET /health`
- `POST /webhooks/telegram`
- `GET /debug/session/:threadId`
- `POST /debug/reset/:threadId`

## Required bindings and vars

Set these in `wrangler.jsonc`, `.dev.vars`, or your Cloudflare environment:

```txt
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET_TOKEN=
DEBUG_API_SECRET=
ALLOWED_TELEGRAM_USERS=          # optional, comma-separated Telegram user IDs
```

The worker also requires the Cloudflare Workers AI binding:

```jsonc
"ai": {
  "binding": "AI"
}
```

## Development

```txt
pnpm install
pnpm run check
pnpm run test
pnpm run dev
```

## Telegram behavior

- Responds to first direct messages
- Responds to first mentions in group chats
- Subscribes the thread after the first handled message
- Continues replying on subscribed follow-up messages
- Supports `/start`, `/help`, and `/reset`

## Webhook setup

Expose your local worker with a tunnel (e.g. `pnpm run dev` with Cloudflare Quick Tunnels), then register the webhook:

```bash
./scripts/set-webhook.sh https://<your-public-url>
```

The script loads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET_TOKEN` from `.env` and points Telegram to `<url>/webhooks/telegram`.

## Debug examples

Read a stored session:

```bash
curl \
  -H "Authorization: Bearer $DEBUG_API_SECRET" \
  http://127.0.0.1:8787/debug/session/telegram:12345
```

Reset a stored session:

```bash
curl -X POST \
  -H "Authorization: Bearer $DEBUG_API_SECRET" \
  http://127.0.0.1:8787/debug/reset/telegram:12345
```

## Type generation

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
pnpm run cf-typegen
```
