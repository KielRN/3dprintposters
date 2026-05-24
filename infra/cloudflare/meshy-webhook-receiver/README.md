# Meshy Webhook Receiver

Cloudflare Worker used as the HTTPS payload URL for Meshy task-status webhooks.

Payload URL:

```text
https://api.3dprintyou.com/webhooks/meshy
```

The Worker uses `api.3dprintyou.com` as a Cloudflare Workers custom domain and has `workers_dev` disabled. It accepts Meshy JSON `POST` payloads at `/webhooks/meshy`, verifies `x-meshy-api-webhook-secret-key` against the encrypted `MESHY_WEBHOOK_SECRET` Worker secret, logs a sanitized task/header summary without secret values, and returns `202 Accepted`.
