# Roadmap

This file tracks product direction and enhancement ideas that are not yet committed execution work. Use `CHECKLIST.md` for concrete implementation tasks and `CHANGELOG.md` for completed progress.

## Near-Term MVP

- Finish the web-first PWA flow: sign-in, photo upload, style selection, job creation, preview, checkout, and order tracking.
- Keep the first customer journey narrow: one uploaded photo, one selected style, one generated printable poster, and one checkout path.
- Make every generated artifact traceable to a user, job, and order before fulfillment.

## Cloudflare/Deployment

- Use `3dprintposters.com` as the product domain.
- Choose the first hosting target before creating final DNS records.
- Create the project AI Gateway after selecting the first model provider and model strategy.
- Keep Cloudflare API access least-privilege and local-only until a CI/CD path is intentionally added.
- Add rate limits for upload, job creation, and checkout after MVP flows are stable.

## AI Pipeline

- Decide the first model provider and whether Cloudflare AI Gateway will route provider-native calls or Workers AI calls.
- Start with a single generation path before adding style variations, prompt tuning, or batch generation.
- Add moderation, quota checks, and cost caps before public traffic.
- Save enough metadata for each generation to debug quality, cost, and fulfillment issues without storing secrets.

## STL/Preview

- Implement image validation, normalization, heightmap generation, and binary STL output.
- Add browser-friendly preview output, likely GLB or a lightweight mesh representation, after the STL contract is stable.
- Add printability checks for model dimensions, thickness, relief depth, and file size.
- Preserve the exact STL and settings used for any paid order.

## Payments/Fulfillment

- Keep Stripe in test mode until payment, webhook, and order state transitions are proven end to end.
- Confirm Sculpteo or alternate fulfillment API capabilities before committing to provider-specific behavior.
- Require confirmed payment before sending any order to fulfillment.
- Store quote, material, dimensions, shipping option, provider order ID, and provider responses for each order.

## Admin/Ops

- Add an admin view for failed jobs, payment mismatches, fulfillment retries, and manual review.
- Add structured logs for job, payment, and fulfillment state changes.
- Add cleanup jobs for abandoned uploads and expired generated artifacts.
- Add alerting for model cost spikes, failed webhooks, fulfillment failures, and storage growth.

## Future Enhancements

- User-adjustable relief depth, crop, border, text, and style controls.
- Approval galleries with multiple generated variants.
- Gift options, saved addresses, reorders, and order sharing.
- Native mobile packaging after the web MVP proves the workflow.
- Additional fulfillment providers or fallback fulfillment paths.
