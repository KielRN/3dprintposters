# Figurine Provider And PrintU Workflow Research

Date: 2026-05-23
Last updated: 2026-05-24

## Executive Decision

Customer acquisition and business-model proof are now the priority. The current poster-relief generator remains valuable R&D, but it should not block a customer-facing MVP while relief quality is still uncertain.

The near-term product should copy the winning shape of MakerWorld PrintU: upload a photo, choose a figurine style, choose posture, generate a 2D proof, generate or import a full 3D figurine, preview it, then collect purchase intent or checkout. If relief or 3D painting remains too hard, the business should use what AI 3D models already do well: standalone stylized figurines and character objects.

Meshy.ai is the first provider to evaluate seriously because it now offers a production API, Meshy-6 image-to-3D, STL/GLB/OBJ/FBX/USDZ/3MF output options, multicolor 3D-printing support, and a public MakerWorld/MakerLab integration.

The better-fit public domain for this pivot is `3dprintyou.com`. Keep `3dprintposters.com` available for the parked poster-relief product line or as a redirect later.

## What PrintU Proves

PrintU is important because it demonstrates a simple consumer mental model:

- A customer does not ask for a technical print file. They ask for "my figurine."
- The workflow is guided: upload image, pick style, pick posture, approve a 2D preview, then generate 3D.
- Styles seen in the user-provided screenshots include Bobblehead, Chibi, Cartoon, and Emoji.
- Posture choices seen in the user-provided screenshots include Natural pose, Image pose, and T-pose beta.
- Third-party coverage of PrintU describes support for JPG/PNG/WEBP/JPEG uploads up to 10 MB, a 2D preview before 3D generation, an integrated editor for bases/name tags/colors/poses, and export for printing.

Sources:

- [3Druck: Bambu Lab MakerLab PrintU](https://3druck.com/en/programs/bambu-lab-makerlab-printu-ki-tool-creates-3d-figures-from-photos-for-3d-printing-25152149/)
- [Stampare in 3D: Bambu Lab MakerLab PrintU](https://stamparein3d.it/bambu-lab-makerlab-printu/)

## Meshy Findings

Meshy is now directly relevant to a PrintU-like business model.

Current useful facts from official Meshy docs and announcements:

- Meshy Image to 3D API supports a `POST /openapi/v1/image-to-3d` task flow.
- Input can be an existing Meshy image-generation task id or an `image_url`; Meshy-6 is available through `ai_model: "meshy-6"` or `latest`.
- Output formats can be requested with `target_formats`; documented values include `glb`, `obj`, `fbx`, `stl`, `usdz`, and `3mf`. Meshy notes that `3mf` must be explicitly requested.
- Returned task objects include downloadable model URLs, thumbnails from multiple angles, texture URLs, status/progress, expiration, and consumed credits.
- Meshy-6 added cleaner geometry, more anatomically correct character/organic shapes, hard-surface improvements, low-poly mode, multi-color printing, and API upgrades.
- Meshy's API page says Pro and higher tiers can use the API, non-enterprise API assets are retained for 3 days, CORS is not supported, and API inputs/generated models are not used for training.
- API pricing on the Meshy API page lists Image to 3D at 20 credits without texture and 30 credits with texture for Meshy-6 models; other models are listed lower. Pricing can change, so verify before implementation.
- Meshy's March 17, 2026 announcement says Meshy Image-to-3D is integrated into MakerWorld MakerLab, can generate print-ready models from a single image in the browser, and can export STL, 3MF, and GLB. It also says Meshy's multicolor workflow maps textures into Bambu AMS-compatible color zones and exports 3MF.
- Local setup now includes `MESHY_API_KEY` in the ignored root `.env` for a paid monthly account. Do not print, copy, or commit the key.
- Meshy webhook setup is currently dashboard-based: official docs direct users to the Meshy API settings page, Webhooks section, and "Create Webhook" button. No documented REST endpoint was found for creating a webhook by API as of 2026-05-23.
- Meshy webhooks require HTTPS and send task status updates to each enabled webhook URL. The project receiver is deployed at `https://api.3dprintyou.com/webhooks/meshy`.
- A real Meshy delivery on 2026-05-23 confirmed Meshy sends `x-meshy-api-webhook-secret-key` and `x-meshy-api-webhook-user-id`; the Worker enforces the secret header and logs only sanitized metadata.
- Test task `019e562e-06ea-7e78-b3e6-98651023fae2` delivered real `PENDING` and `FAILED` webhook events, failed at 15% progress, and reported `0` consumed credits. This proves webhook delivery/security, not provider output quality.
- Local Cloudflare setup is partially sufficient: `CLOUDFLARE_API_TOKEN` verifies and can deploy Workers, but still returns `403` for DNS record and Worker route reads.

Sources:

- [Meshy Image to 3D API docs](https://docs.meshy.ai/en/api/image-to-3d)
- [Meshy API platform and pricing](https://www.meshy.ai/api)
- [Meshy-6 launch](https://www.meshy.ai/blog/meshy-6-launch)
- [Meshy x MakerWorld announcement via PRNewswire](https://www.prnewswire.com/news-releases/how-to-turn-any-image-into-a-full-color-3d-print-in-one-click--meshys-multi-color-printing-powered-by-meshy-6-is-now-live-on-makerworld-302714800.html)
- [Meshy API changelog](https://docs.meshy.ai/en/api/changelog)
- [Meshy webhooks docs](https://docs.meshy.ai/en/api/webhooks)
- [Meshy asset retention docs](https://docs.meshy.ai/en/api/asset-retention)

## Product Strategy Shift

Old near-term strategy:

- Generate controlled poster art.
- Convert approved proof into a 5x7 bas-relief.
- Keep tuning heightmaps, surface intent, and print-file generation until the relief looks product-ready.

New near-term strategy:

- Prove whether customers want personalized AI figurines enough to upload photos and pay.
- Build the customer-facing PrintU-like UI first.
- Use existing AI 3D providers for the hard geometry step instead of making the in-house relief generator the blocker.
- Treat Meshy as the first integration candidate, with MakerWorld/PrintU as the product UX reference.
- Keep relief as a later or alternate product line once the business has demand proof.

## Recommended MVP Flow

1. User signs in or continues as guest.
2. User uploads one source photo.
3. User chooses figurine style: Bobblehead, Chibi, Cartoon, Emoji, or similar.
4. User chooses posture: Natural pose, Image pose, T-pose, or provider-supported equivalent.
5. Backend generates a 2D proof using the current Vertex/Gemini adapter or a provider-specific image-prep route.
6. User approves the 2D proof.
7. Backend sends the approved proof or source image to the selected 3D provider, starting with Meshy.
8. Backend stores provider artifacts such as `model.glb`, `model.stl`, optional `model.3mf`, thumbnails, provider audit, cost, and warnings under user/job scoped Storage paths.
9. Job page shows the generated 3D figurine GLB and readiness/warning state.
10. Checkout collects payment only after the user sees a plausible 3D preview, or the MVP collects lead/preorder intent if fulfillment is still manual.

## Provider Evaluation Criteria

Evaluate Meshy and any alternative provider against:

- Recognizable likeness from one photo or approved stylized proof.
- Strength on stylized figurines, especially bobblehead/chibi/cartoon outputs.
- Pose control or compatibility with natural pose, image pose, and T-pose.
- Downloadable formats: GLB for preview, STL for single-color/manual print validation, and 3MF for multicolor/Bambu workflows.
- Printability after slicing: watertightness, supports, scale, fragile parts, color/material handling, and failed-slice rate.
- Cost per accepted customer preview.
- Latency and retry behavior.
- Commercial-use terms, likeness/privacy constraints, acceptable-use policy, and data retention.
- Whether assets can be retained long enough by downloading them into our Storage immediately.
- Whether provider output is good enough without manual Blender cleanup for the first paid product.

## Verified Webhook State

- Payload URL: `https://api.3dprintyou.com/webhooks/meshy`.
- Hosting: Cloudflare Workers custom domain on `api.3dprintyou.com`; the default `workers.dev` trigger is disabled.
- Authentication: Meshy sends `x-meshy-api-webhook-secret-key`; the Worker compares it with encrypted `MESHY_WEBHOOK_SECRET` and rejects unauthenticated POSTs with `401`.
- Observability: the Worker logs sanitized task summaries and signature-header presence only. It must not log secret values, provider asset URLs, or account/user identifiers.
- Current limitation: the receiver only acknowledges and logs events. It does not yet update Firestore jobs or download Meshy assets into Storage.

## Important Reinterpretation Of Earlier Research

The May 2026 TripoSR/Tripo experiment was rejected for poster relief because full image-to-3D reconstruction created standalone objects instead of image-plane bas-relief depth. That result now becomes a signal in the opposite direction: standalone object reconstruction is exactly the class of model to test for a figurine product.

Do not let older docs that say "image-to-3D is rejected" be read globally. It is rejected for 5x7 poster relief. It is now a candidate path for personalized figurines.

## Risks And Human Decisions

- Product positioning: 3DPrintPosters may need a figurine-first landing page, sub-brand, or renamed offer if "poster" confuses customers.
- Provider dependency: a Meshy-first MVP should keep provider routing server-side so Meshy can be swapped or compared later.
- Legal/privacy: use explicit consent for customer likeness, avoid celebrity/IP/fan-art commercial use, and keep moderation before provider submission.
- Fulfillment: provider output still needs real slicing and physical print validation before paid fulfillment is automated.
- Pricing: credits and subscriptions may change; verify exact economics before committing public price points.
- Customer promise: market the first version as personalized stylized figurines, not exact anatomical or CAD-grade replicas.

## Next Actions

1. Run successful Meshy or MakerWorld PrintU-style generations with canonical and customer-like inputs, then classify output quality as promising, weak, or not viable.
2. Download GLB/STL/3MF outputs from successful tasks and inspect them in Bambu Studio, OrcaSlicer, or equivalent for scale, supports, fragile parts, color handling, and print-time/material estimates.
3. Decide which style/posture options belong in the first customer-facing UI based on actual Meshy/PrintU outputs, not only provider marketing.
4. Add a customer-facing figurine creation UI: style selector, posture selector, 2D proof generation, proof approval, and 3D preview state.
5. Add a server-side generated-3D provider abstraction, with Meshy as the first implementation only if output quality, terms, and economics are accepted.
6. Extend the Cloudflare/Firebase webhook path so accepted Meshy events update Firestore jobs and download provider assets into user/job-scoped Storage before Meshy retention expires.
7. Decide whether launch should be a paid preorder/manual fulfillment path, lead capture, or fully automated checkout.
8. Expand the Cloudflare token permissions enough for DNS record and Worker route reads, or document that dashboard/Wrangler deploy is the supported route-management path.
