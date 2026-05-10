# Roadmap

This file tracks product direction and enhancement ideas that are not yet committed execution work. Use `CHECKLIST.md` for concrete implementation tasks and `CHANGELOG.md` for completed progress.

## Near-Term MVP

- Continue the web-first PWA flow from the now-wired sign-in, photo upload, style selection, job creation, generated proof approval, checkout, and single-order status path into real print preview artifacts, account-level order history, and fulfillment tracking.
- Keep the first customer journey narrow: one uploaded photo, one selected style, one generated 5in x 7in printable poster, and one checkout path.
- Make every generated artifact traceable to a user, job, and order before fulfillment.
- Replace remaining placeholder preview and local API scaffolds with the authenticated Firebase-backed workflow where needed.
- Treat [Print File Generator Architecture Roadmap Evaluation](./PRINT_FILE_GENERATOR_ARCHITECTURE_ROADMAP_EVALUATION.md) for the print-file service boundary, and [Heightmap Final Evaluation Review](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) for the next relief implementation slice.

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
- Production assumes API-based AI inference. Local model inference is dev/experiment territory only; offline operation is not a goal.
- Each AI role (poster proof generation, monocular depth, subject segmentation, future image-to-3D) sits behind a typed provider interface modeled on `apps/functions/src/aiProvider.ts`, with a chain of API-backed implementations (Vertex AI, HF Inference, Cloudflare-gatewayed) selected by registry config.
- Cloudflare AI Gateway is the unified observability/rate-limit/fallback pane for cross-provider routing, not an MVP-only afterthought. Wire roles through it as their gateway-served implementations land.
- Start with a single generation path per role before adding style variations, prompt tuning, or batch generation.
- Add moderation, quota checks, and cost caps before public traffic.
- Save enough metadata for each generation — including which provider in the chain served the request, attempted fallbacks, and model version — to debug quality, cost, and fulfillment issues without storing secrets.

## Print Files/Preview

- Keep `services/print-file-generator` as the FastAPI/Cloud Run production boundary and selectively extract core image, heightmap, STL, color, and test concepts from `E:\PROJECTS\print-file-generator`.
- Do not vendor the standalone Flask, SQLite, browser-session, CLI, or TD1 hardware app architecture into the production service.
- First replace the service stub with deterministic image validation, normalization, 5:7 crop/padding, heightmap generation, and a closed watertight 5in x 7in relief mesh with base and sidewalls.
- Export binary `model.stl`, `heightmap.png`, `metadata.json`, and then add a browser-friendly preview output, likely GLB or a lightweight mesh representation.
- Add filament painting support files: palette, layer swaps, print settings, and preview.
- Add full-color package artifacts such as 3MF or OBJ plus texture after the deterministic geometry path is validated.
- Add printability checks for 5in x 7in model dimensions, thickness, relief depth, texture alignment, layer swap assumptions, and file size.
- The five-experiment heightmap research cycle is complete (see [research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md](../research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md) and [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md)). Full image-to-3D reconstruction (TripoSR class) is rejected for poster relief — it builds standalone figurines, not image-plane depth.
- Harden the opt-in `masked_depth_detail_blend` provider as the next production-eligible relief path: semantic depth, subject mask, in-mask detail blend from the deterministic luminance/lithophane source, guided-filter bas-relief compression, and the existing closed-mesh STL/GLB generator.
- Treat the deterministic providers (`posterized_luminance`, `continuous_luminance`, `lithophane_baseline`) as last-resort safety net only — used when every API-backed provider in the chain fails. They are not the production target.
- Preserve the exact artifact manifest, color package, filament settings, geometry settings, and provider audit (which provider served each AI role, attempted fallbacks, model versions) used for any paid order.

## Quality Gates for Relief Output

- Treat the per-metric gates in [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) item 3 as the acceptance bar for default-eligible relief providers: subject/background separation, background flatness (the primary discriminator after the bas-relief transform swap), hard mask ridge, high-frequency printable noise, and portrait face detection.
- Compute gates per provider so providers serving the same role can be compared and swapped. Implementation lives at [services/print-file-generator/app/quality_gates.py](../services/print-file-generator/app/quality_gates.py); calibration view at `scripts/run_quality_gates.py`.
- Replace the dropped composition-preservation metric (SSIM-on-brightness is structurally broken for relief) with a relief-appropriate one (gradient-magnitude correlation or edge-map IoU) before any non-portrait gate runs in strict mode.
- Wire latency/cost metrics from Cloud Logging into the same gate framework so production traffic, not just CI, drives provider eligibility.

## Production Provider Registry

- Each AI role has a typed `*Provider` Protocol, a `*Chain` that tries providers in order with `ProviderError` failover and `ProviderAudit` capture, and a default factory built from registry config. Scaffolding lives at [services/print-file-generator/app/providers/](../services/print-file-generator/app/providers/).
- Registry config (priority order, retry policy, cost ceilings, license/ToS approval) lives in Firestore (or typed config under `infra/firebase/`); per-job execution writes the resolved chain to the job document for audit.
- Implement Vertex AI and Cloudflare-gateway concrete providers for both segmentation and monocular depth. Stubs already raise `ProviderError` cleanly so chains fall through.
- Cache provider responses by content hash in Firebase Storage (`cache/{role}/{provider_id}/{model_version}/{sha256}.{ext}`); TTL infinite, invalidated only by registry `model_version` change.
- Auth via service-account ADC for Vertex; via Secret Manager for external API keys. Treat env-var/`.env` as dev fallback.

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
