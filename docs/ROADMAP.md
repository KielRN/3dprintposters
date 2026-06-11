# Roadmap

This file tracks product direction and enhancement ideas that are not yet committed execution work. `CHECKLIST.md` is now an archive pointer; use `AI_DEVELOPER_NOTES.md` for compact current status, `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` for Meshy implementation detail, and `CHANGELOG.md` for completed progress.

## Near-Term MVP

- Pivot the near-term MVP toward customer acquisition and business-model proof before more poster-relief tuning.
- Keep the first customer journey narrow: one uploaded photo, one selected figurine style, one selected posture, one generated 2D proof, one generated 3D figurine preview, and one purchase-intent path.
- Use MakerWorld PrintU as the UX reference: upload image, choose Bobblehead/Chibi/Cartoon/Emoji-style output, choose Natural/Image/T-pose posture, approve a 2D preview, then generate or edit a 3D figurine.
- Treat Meshy.ai as the first serious image-to-3D provider candidate because its current API and MakerWorld integration are aimed at the exact "photo to printable 3D model" gap.
- Keep the "Super Dad" poster-relief path as parked R&D. It remains valuable if the product returns to 5x7 relief posters, but it is not the next customer-acquisition blocker.
- Make every generated artifact traceable to a user, job, and order before fulfillment.
- Replace remaining placeholder preview and local API scaffolds with the authenticated Firebase-backed workflow where needed.
- Treat [Meshy Figurine UI Workflow](./MESHY_FIGURINE_UI_WORKFLOW.md) as the target customer-flow/service map, [Figurine Provider And PrintU Workflow Research](../research/FIGURINE_PROVIDER_RESEARCH.md) as the current product pivot source, [Print File Generation Workflow](./PRINT_FILE_GENERATION_WORKFLOW.md) as the parked poster-relief service contract, and [Heightmap Final Evaluation Review](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) as historical relief research.

## Cloudflare/Deployment

- Use `3dprintyou.com` as the preferred public domain candidate for the figurine/customer-acquisition pivot.
- Keep `3dprintposters.com` available for the parked poster-relief product line or future redirect strategy.
- Use Firebase App Hosting as the first public web hosting target for `apps/web`.
- Create staging first, then point a chosen staging hostname such as `staging.3dprintyou.com` at the Firebase-generated App Hosting backend domain.
- Point `www.3dprintyou.com` at the production App Hosting backend domain after the production backend exists.
- Current testing is still local at `http://localhost:3000` until the App Hosting backend is created.
- Keep the function-only emulator path available for local customer-flow testing; the full emulator workflow is checked in and preflights JDK 21+ before startup.
- Keep Cloudflare AI Gateway as a later traffic-management layer, not an MVP dependency.
- Keep Cloudflare API access least-privilege and local-only until a CI/CD path is intentionally added.
- Add rate limits for upload, job creation, and checkout after MVP flows are stable.

## AI Pipeline

- Start with direct GCP Vertex/Gemini integration for MVP speed; the first proof-generation route uses `gemini-2.5-flash-image` through Vertex AI express mode unless overridden.
- Production assumes API-based AI inference. Local model inference is dev/experiment territory only; offline operation is not a goal.
- Add a separate 3D model provider role for standalone figurine generation. This role should be server-side, auditable, replaceable, and start with Meshy only after manual output, terms, cost, and retention checks are accepted.
- The May 2026 image-to-3D rejection applies to poster relief only. Full 3D reconstruction was wrong for image-plane bas-relief because it produced standalone objects; standalone objects are now the desired output for the figurine path.
- Store provider outputs immediately in Firebase Storage because external providers may expire generated assets quickly. Preserve GLB for preview, STL for geometry validation/single-color printing, and 3MF when multicolor/Bambu-style workflows are in scope.
- The first production style family should generate controlled printable art, not photorealistic source-photo texture. For the Super Dad path, prompt/style policy should prefer smooth stylized skin, clean scalp/neck/body volumes, crisp typography, sharp logos/emblems, simple backgrounds, and only explicitly requested material texture.
- AI proof generation now records a style contract and print generation has a `smooth-default-v1` surface-intent schema. The next step is to thread that metadata through approval and use it for inferred masks such as `smooth_skin`, `smooth_body`, `smooth_fabric`, `flat_background`, `raised_text`, `raised_logo`, `panel_line`, `hair_texture`, or other printable texture classes.
- Each AI role should sit behind a typed provider interface modeled on `apps/functions/src/aiProvider.ts`. The active role to add is `figurine_model_generation`; poster-relief roles (monocular depth, subject segmentation, proof cleanup/depth-friendly preprocessing) are parked until the relief line is reactivated.
- Work backward from human-approved production STLs only if the poster-relief line resumes. The approved-relief dataset milestone in [Approved Relief Training Protocols](./APPROVED_RELIEF_TRAINING_PROTOCOLS.md) is paused during the figurine demand proof.
- Cloudflare AI Gateway is the unified observability/rate-limit/fallback pane for cross-provider routing, not an MVP-only afterthought. Wire roles through it as their gateway-served implementations land.
- Start with a single generation path per role before adding style variations, prompt tuning, or batch generation.
- Add moderation, quota checks, and cost caps before public traffic.
- Save enough metadata for each generation — including which provider in the chain served the request, attempted fallbacks, and model version — to debug quality, cost, and fulfillment issues without storing secrets.

## Figurine Workflow Services

- Add a Functions-side figurine job orchestration service that owns source validation, style/posture metadata, concept/model selection, job status, model readiness, and checkout eligibility.
- Add a 2D concept service on top of the existing AI provider adapter. It should create concept history, store selected concept IDs, and avoid spending generated-3D credits until a concept is selected/approved.
- Add a generated-3D provider service with a replaceable interface and Meshy as the first implementation after output quality, terms, and economics are accepted for the customer-facing experience.
- Add a Meshy task service that handles task submission, polling, webhook correlation, sanitized audit metadata, retry/failure state, and consumed credit/cost reporting.
- Add an asset-ingestion service that downloads GLB, STL, optional 3MF, thumbnails, and metadata into user/job-scoped Firebase Storage before external retention expires.
- Add a model-readiness service that reports preview-ready, needs-review, printability-warning, print-ready, or blocked states for the job page and checkout gate.
- Add an editor-config persistence service for color mode, base shape/texture/color, sign text/style, print-separately flags, and any supported posture/transform revisions.
- Add a purchase-intent gate that can route to lead capture, paid preorder/manual fulfillment, or checkout only after the selected model's fulfillment path is represented honestly.

## Print Files/Preview

- Active figurine track:

- Add a provider-generated figurine artifact bundle under user/job scoped Storage paths, such as `generated-models/{uid}/{jobId}/{modelId}/model.glb`, `model.stl`, optional `model.3mf`, thumbnails, provider metadata, and warnings.
- Show the standalone figurine GLB in the job page with controls suitable for inspecting a character/object from all sides.
- Validate Meshy/MakerWorld-generated outputs in slicer and with at least one physical print before automated fulfillment depends on them.
- Decide whether the MVP ships with checkout, paid preorder/manual fulfillment, or lead capture while physical print validation catches up.

Parked poster-relief track:

- Keep `services/print-file-generator` as the FastAPI/Cloud Run production boundary and selectively extract core image, heightmap, STL, color, and test concepts from `E:\PROJECTS\print-file-generator`.
- Do not vendor the standalone Flask, SQLite, browser-session, CLI, or TD1 hardware app architecture into the production service.
- The service now generates validated image input, 5:7 crop/padding, a 768px geometry-analysis image, a 400px mesh/color output, a closed watertight 5.5in x 7.5in physical relief mesh with a 5in x 7in image window, binary `model.stl`, `heightmap.png`, `metadata.json`, and browser-friendly `preview.glb`.
- The service now generates filament painting support files: palette, layer swaps, print settings, and preview.
- The service now generates full-color package artifacts: 3MF, OBJ/MTL/texture, VRML, and PLY. These still need partner validation before fulfillment depends on them.
- Add printability checks for 5in x 7in model dimensions, thickness, relief depth, texture alignment, layer swap assumptions, and file size.
- The five-experiment heightmap research cycle is complete (see [research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md](../research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md) and [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md)). Full image-to-3D reconstruction (TripoSR class) is rejected for poster relief — it builds standalone figurines, not image-plane depth.
- Continue hardening the now-default `masked_depth_detail_blend` relief path, but aim the next tuning pass at surface intent rather than raw photo-detail recovery: geometry-only proof cleanup, semantic depth, contour-smoothed subject mask, controlled detail blend, guided-filter bas-relief compression, broad smooth-surface protection, and the existing closed-mesh STL/GLB generator.
- Add a Blender gold-master review loop for production STL approval: import the generated STL, preserve the physical dimensions/frame, sculpt or repair only approved relief defects, export `model.approved.stl`, extract aligned 2D supervision maps, and compare generator output to the approved gold master before any LoRA or ControlNet training.
- Add a surface-intent/material policy to print generation. The default rule is smooth unless a region is explicitly marked as text, logo, graphic edge, panel line, hair, fabric, or another printable texture class. This should cover scalp/top-of-head, neck, ears, hands, simple clothing, and backgrounds, not only the detected face oval.
- Keep face-aware portrait tuning inside the server-side print-file generator, but treat it as one input to a broader human/material-aware mask system. Use masks to preserve larger face/head/shoulder forms and damp harsh deterministic detail around eyes, teeth, mouth, skin, scalp, neck, and collar areas; defer a separate external face/body API until product-flow testing proves local detection is insufficient.
- Review the 400px mesh output against real app and Blender artifacts before raising resolution again. The intended full-color print partner can benefit from finer geometry than the old 280px path, but STL/package size, browser preview performance, Cloud Run runtime, and partner upload limits must stay inside practical bounds.
- Treat the deterministic providers (`posterized_luminance`, `continuous_luminance`, `lithophane_baseline`) as sidecar reference providers and explicit fallback-test tools only. They are not the production target and should not silently replace the hybrid checkout path when a provider fails.
- Preserve the exact artifact manifest, color package, filament settings, geometry settings, and provider audit (which provider served each AI role, attempted fallbacks, model versions) used for any paid order.

## Quality Gates for Relief Output

- Treat the per-metric gates in [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](../research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) item 3 as the acceptance bar for default-eligible relief providers: subject/background separation, background flatness (the primary discriminator after the bas-relief transform swap), hard mask ridge, high-frequency printable noise, and portrait face detection.
- Compute gates per provider so providers serving the same role can be compared and swapped. Implementation lives at [services/print-file-generator/app/quality_gates.py](../services/print-file-generator/app/quality_gates.py); calibration view at `scripts/run_quality_gates.py`.
- Composition preservation now uses gradient-magnitude correlation instead of SSIM-on-brightness, so the gate compares whether major source-image edges survive in the relief heightmap without treating inverted brightness as a failure.
- Add region-aware roughness checks for surface-intent classes. `smooth_skin`, `smooth_body`, `smooth_fabric`, and `flat_background` should have low high-frequency height variation; `raised_text`, `raised_logo`, and graphic panel edges may keep sharper local gradients.
- Wire latency/cost metrics from Cloud Logging into the same gate framework so production traffic, not just CI, drives provider eligibility.

## Production Provider Registry

- Each AI role has a typed `*Provider` Protocol, a `*Chain` that tries providers in order with `ProviderError` failover and `ProviderAudit` capture, and a default factory built from registry config. Scaffolding lives at [services/print-file-generator/app/providers/](../services/print-file-generator/app/providers/).
- Registry config (priority order, retry policy, cost ceilings, license/ToS approval) lives in Firestore (or typed config under `infra/firebase/`); per-job execution writes the resolved chain to the job document for audit.
- Implement Vertex AI and Cloudflare-gateway concrete providers for both segmentation and monocular depth. Stubs already raise `ProviderError` cleanly so chains fall through.
- Cache provider responses by content hash in Firebase Storage (`cache/{role}/{provider_id}/{model_version}/{sha256}.{ext}`); TTL infinite, invalidated only by registry `model_version` change.
- Auth via service-account ADC for Vertex; via Secret Manager for external API keys. Treat env-var/`.env` as dev fallback.

## Payments/Fulfillment

- Keep Stripe in test mode until payment, webhook, and order state transitions are proven end to end.
- Decide whether the first figurine validation path is a paid preorder/manual fulfillment path or a fully automated checkout path. Do not imply automated fulfillment until generated figurine files pass slicer and physical-print validation.
- For figurines, evaluate local/Bambu-class FDM or an accessible print partner before defaulting to the older Mimaki 3DUJ-2207 relief-partner assumption.
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
