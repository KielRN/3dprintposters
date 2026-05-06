# Roadmap

This file tracks product direction and enhancement ideas that are not yet committed execution work. Use `CHECKLIST.md` for concrete implementation tasks and `CHANGELOG.md` for completed progress.

## Near-Term MVP

- Continue the web-first PWA flow from the now-wired sign-in, photo upload, style selection, job creation, generated proof approval, checkout, and single-order status path into real print preview artifacts, account-level order history, and fulfillment tracking.
- Keep the first customer journey narrow: one uploaded photo, one selected style, one generated 5in x 7in printable poster, and one checkout path.
- Make every generated artifact traceable to a user, job, and order before fulfillment.
- Replace remaining placeholder preview and local API scaffolds with the authenticated Firebase-backed workflow where needed.
- Treat [Print File Generator Architecture Roadmap Evaluation](./PRINT_FILE_GENERATOR_ARCHITECTURE_ROADMAP_EVALUATION.md) as the source of truth for the next print-file implementation slice.

## Cloudflare/Deployment

- Use `3dprintposters.com` as the product domain.
- Use Firebase App Hosting as the first public web hosting target for `apps/web`.
- Create staging first, then point `staging.3dprintposters.com` at the Firebase-generated App Hosting backend domain.
- Point `www.3dprintposters.com` at the production App Hosting backend domain after the production backend exists.
- Current testing is still local at `http://localhost:3000` until the App Hosting backend is created.
- Keep the function-only emulator path available for local customer-flow testing; the full emulator workflow is checked in and preflights JDK 21+ before startup.
- Keep Cloudflare AI Gateway as a later traffic-management layer, not an MVP dependency.
- Keep Cloudflare API access least-privilege and local-only until a CI/CD path is intentionally added.
- Add rate limits for upload, job creation, and checkout after MVP flows are stable.

## AI Pipeline

- Start with direct GCP Vertex/Gemini integration for MVP speed; the first proof-generation route uses `gemini-2.5-flash-image` through Vertex AI express mode unless overridden.
- Keep AI calls behind an internal provider adapter so Cloudflare AI Gateway can be added later for cross-provider routing, observability, rate limiting, and fallback.
- Start with a single generation path before adding style variations, prompt tuning, or batch generation.
- Add moderation, quota checks, and cost caps before public traffic.
- Save enough metadata for each generation to debug quality, cost, and fulfillment issues without storing secrets.

## Print Files/Preview

- Keep `services/print-file-generator` as the FastAPI/Cloud Run production boundary and selectively extract core image, heightmap, STL, color, and test concepts from `E:\PROJECTS\print-file-generator`.
- Do not vendor the standalone Flask, SQLite, browser-session, CLI, or TD1 hardware app architecture into the production service.
- First replace the service stub with deterministic image validation, normalization, 5:7 crop/padding, heightmap generation, and a closed watertight 5in x 7in relief mesh with base and sidewalls.
- Export binary `model.stl`, `heightmap.png`, `metadata.json`, and then add a browser-friendly preview output, likely GLB or a lightweight mesh representation.
- Add filament painting support files: palette, layer swaps, print settings, and preview.
- Add full-color package artifacts such as 3MF or OBJ plus texture after the deterministic geometry path is validated.
- Add printability checks for 5in x 7in model dimensions, thickness, relief depth, texture alignment, layer swap assumptions, and file size.
- Add AI depth providers only after the deterministic relief pipeline works; first candidate remains Depth Anything V2 Small, with Depth Pro and MoGe as follow-up evaluations.
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
