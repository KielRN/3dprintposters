# Roadmap

This file tracks product direction and enhancement ideas that are not yet committed execution work. Use `CHECKLIST.md` for concrete implementation tasks and `CHANGELOG.md` for completed progress.

## Near-Term MVP

- Continue the web-first PWA flow from the now-wired sign-in, photo upload, style selection, and job creation path into generated image approval, real preview artifacts, checkout, and order tracking.
- Keep the first customer journey narrow: one uploaded photo, one selected style, one generated 5in x 7in printable poster, and one checkout path.
- Make every generated artifact traceable to a user, job, and order before fulfillment.
- Replace remaining placeholder preview and local API scaffolds with the authenticated Firebase-backed workflow where needed.

## Cloudflare/Deployment

- Use `3dprintposters.com` as the product domain.
- Choose the first hosting target before creating final DNS records.
- Keep Cloudflare AI Gateway as a later traffic-management layer, not an MVP dependency.
- Keep Cloudflare API access least-privilege and local-only until a CI/CD path is intentionally added.
- Add rate limits for upload, job creation, and checkout after MVP flows are stable.

## AI Pipeline

- Start with direct GCP Vertex/Gemini integration for MVP speed.
- Keep AI calls behind an internal provider adapter so Cloudflare AI Gateway can be added later for cross-provider routing, observability, rate limiting, and fallback.
- Start with a single generation path before adding style variations, prompt tuning, or batch generation.
- Add moderation, quota checks, and cost caps before public traffic.
- Save enough metadata for each generation to debug quality, cost, and fulfillment issues without storing secrets.

## Print Files/Preview

- Implement image validation, normalization, 5:7 crop/padding, heightmap generation, binary STL output, and a color-capable print package.
- Add filament painting support files: palette, layer swaps, print settings, and preview.
- Add browser-friendly preview output, likely GLB or a lightweight mesh representation, after the print file contract is stable.
- Add printability checks for 5in x 7in model dimensions, thickness, relief depth, texture alignment, layer swap assumptions, and file size.
- Preserve the exact artifact manifest, color package, filament settings, and geometry settings used for any paid order.

## Payments/Fulfillment

- Keep Stripe in test mode until payment, webhook, and order state transitions are proven end to end.
- Find and qualify a business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer.
- Keep Sculpteo API access on hold until it is clear whether it fits the Mimaki-targeted workflow.
- Require confirmed payment before sending any order to fulfillment.
- Store quote, material, 5x7 dimensions, shipping option, provider order ID, and provider responses for each order.

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
