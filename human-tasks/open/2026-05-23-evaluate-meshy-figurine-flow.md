# Evaluate Meshy Figurine Output And Printability

Status: open
Owner: Human
Created: 2026-05-23
Source: `research/FIGURINE_PROVIDER_RESEARCH.md`, Meshy webhook docs, verified Cloudflare receiver at `https://api.3dprintyou.com/webhooks/meshy`

## Why Human

This still needs Elliot's Meshy account, dashboard access, and visual/printability judgment. The Cloudflare HTTPS receiver and Meshy dashboard webhook are created; the remaining human work is to judge whether real Meshy/MakerWorld PrintU-style outputs are good enough for the first figurine MVP.

## Steps

1. Open the Meshy account used for the paid monthly plan.
2. Confirm the API key exists in the Meshy API settings page. Do not paste the key into chat or docs.
3. In Meshy or MakerWorld PrintU, test a small set of inputs:
   - `.tmp/input_image/Profile-Pic-HIMSS.jpg`
   - `.tmp/input_image/Gemini_Generated_Image_lzneejlzneejlzne.png`
   - Any customer-like photo Elliot is comfortable using for this test.
4. Test the PrintU-like choices that matter for our UI: Bobblehead, Chibi, Cartoon, Emoji, Natural pose, Image pose, and T-pose when available.
5. Prioritize the first intended app workflow: Image to Emoji/avatar-style figurine with Natural pose.
6. For each useful generation, capture safe notes: style, posture, time, credits/cost, output formats available, whether GLB/STL/3MF download works, and whether the model looks sellable.
7. Open the generated STL/3MF in Bambu Studio, OrcaSlicer, or another slicer and note printability issues: scale, supports, fragile parts, color mapping, warnings, and estimated print time/material.
8. Cloudflare-backed HTTPS receiver is created and smoke-tested. Use payload URL `https://api.3dprintyou.com/webhooks/meshy`.
9. `MESHY_WEBHOOK_SECRET` is present in local `.env` and uploaded as an encrypted Cloudflare Worker secret. A real Meshy delivery confirmed the secret arrives in `x-meshy-api-webhook-secret-key`, and the Worker now rejects webhook POSTs without the matching secret.
10. Meshy API settings webhook is active and delivered real `PENDING` and `FAILED` events to the Worker.
11. For future Cloudflare automation, expand or replace the local Cloudflare API token. On 2026-05-23 the current root `.env` token verified successfully and could see both project zones, but returned `403` for DNS record and Worker route reads.

## Done When

- Meshy output quality is classified as promising, weak, or not viable for the first figurine MVP.
- We know which style/posture combinations should appear in the app first.
- We know whether GLB/STL/3MF files are downloadable and usable in slicer.
- The Meshy webhook remains configured and secret-enforced.
- The next AI developer can implement either polling-only Meshy integration or webhook receiver work with clear constraints.

## Evidence To Capture

- Safe screenshots of generated previews, with no account secrets visible.
- Meshy task ids are okay if useful.
- Local artifact paths for downloaded GLB/STL/3MF files.
- Credit/cost notes without exposing payment details.
- Slicer warnings and print-time/material estimates.
- Webhook proxy/deployed URL only if it is safe and intended to be used by the app.
- Test task `019e562e-06ea-7e78-b3e6-98651023fae2` delivered `PENDING` and `FAILED` webhook events, failed at 15% progress, and reported `0` consumed credits. It was useful for webhook/header verification, not output-quality evaluation.
- AI run on 2026-05-24 created successful Meshy task `019e5b9a-97a2-7788-8174-5cbc9913766f` from `.tmp/Profile-Pic-HIMSS.jpg`, consumed 30 credits, and downloaded artifacts to `.tmp/print-files/meshy/2026-05-24T20-08-40-270Z-019e5b9a-97a2-7788-8174-5cbc9913766f`.
- First-run downloaded files include `model.glb`, `model.stl`, `model.3mf`, `model.pre-remeshed.glb`, `thumbnail.png`, and base-color/normal texture maps.
- Basic local inspection found the 3MF has millimeter units and about `58.9mm x 28.8mm x 75.0mm` extents, but `trimesh` reported the mesh as not watertight. Open `model.3mf` and `model.stl` in Bambu Studio, OrcaSlicer, or equivalent and capture repair warnings, supports, print time, material estimate, and whether the output is commercially acceptable.
- Visual thumbnail review: recognizable bust/torso, but arms are truncated, hands are missing, and there is no lower body. Treat this as a provider pipeline success, not yet a viable complete figurine sample.
- Elliot opened the downloaded GLB in Blender and confirmed it is viewable, but it is not the intended style. Do not judge the first product workflow from this raw-photo output; prioritize Emoji/avatar + Natural pose proof-driven runs next.
- AI run on 2026-05-24 generated an Emoji/avatar Natural pose 2D concept at `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/concept.png`, then created successful Meshy task `019e5c65-7b2b-7641-abd6-ed04fb4e3d2e`, consumed `30` credits, and downloaded GLB/STL/3MF artifacts under `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/meshy/2026-05-24T23-50-17-997Z-019e5c65-7b2b-7641-abd6-ed04fb4e3d2e`.
- The Emoji/avatar thumbnail preserved a complete stylized full-body figure and is much closer to the intended product style than the raw-photo run.
- Meshy printability analysis task `019e5c69-3d55-76ec-aecf-7cd728e6ed38` consumed `0` credits and returned `error`: not watertight, `125` non-manifold edges, `112` degenerate faces, `0` holes. Open this output in Bambu Studio, OrcaSlicer, or equivalent and capture whether automatic repair makes it printable.
- AI run on 2026-05-25 completed Experiment 002 with `npm run meshy:exp-002-multiview`. Meshy Image-to-Image multi-view task `019e5ef8-cc6c-7540-9b86-f8d0f519bc9d` succeeded, consumed `12` credits, and downloaded `multiview/view-1.png`, `multiview/view-2.png`, and `multiview/view-3.png` under `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-2026-05-25T11-50-24-757Z`.
- Experiment 002 Meshy Multi-Image-to-3D task `019e5ef9-cc0d-758e-b1c2-f0a61932e3b6` succeeded, consumed `30` credits, and downloaded `model.glb`, `model.stl`, `model.3mf`, `model.pre-remeshed.glb`, `thumbnail.png`, and texture maps under `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-2026-05-25T11-50-24-757Z`.
- Experiment 002 Meshy printability analysis task `019e5efc-09fc-7db6-a22a-a4eb50f9b338` consumed `0` credits and returned `error`: not watertight, `57` non-manifold edges, `127` degenerate faces, `0` holes. Open this output in Bambu Studio, OrcaSlicer, or equivalent and compare visual quality, repair warnings, supports, stability, scale, print time, and material estimate against Experiment 001.
- AI run on 2026-05-25 completed Experiment 002 B with `npm run meshy:exp-002b-base`, using `human-tasks/printu-15 - Base.png` as a base reference and `Elliott` as the requested front base label. Meshy Image-to-Image multi-view task `019e5f1f-d682-77d3-b332-0808a10a1d34` succeeded, consumed `12` credits, and downloaded three views under `.tmp/experiments/meshy/exp-002b-emoji-natural-base-2026-05-25T12-33-03-165Z/multiview`.
- Experiment 002 B Meshy Multi-Image-to-3D task `019e5f20-db96-79f3-9169-943c310121cd` succeeded, consumed `30` credits, and downloaded `model.glb`, `model.stl`, `model.3mf`, `model.pre-remeshed.glb`, `thumbnail.png`, and texture maps under `.tmp/experiments/meshy/exp-002b-emoji-natural-base-2026-05-25T12-33-03-165Z`.
- Experiment 002 B Meshy printability analysis task `019e5f23-4277-7abb-b7fc-9a4396b0d3e5` consumed `0` credits and returned `error`: not watertight, `70` non-manifold edges, `84` degenerate faces, `0` holes. The multi-view `view-1.png` spells `Elliott` cleanly on the base, but the final 3D thumbnail appears to garble the lettering. Check the STL/3MF in slicer software before deciding whether customer name text should be deterministic post-processing.
- Experiment 002/002 B is closed as the Meshy-generated-base/text cycle. Experiment 003 is prepared as `npm run meshy:exp-003-deterministic-base`; it will run the same Meshy body-generation path and then locally add a deterministic PrintU-style round base with a raised center star under `postprocessed/printu-star/`. It does not add customer name text yet. After Experiment 003 runs, inspect the postprocessed STL/3MF in slicer software and compare base/star printability against Experiment 002 B.

## Related Files

- `docs/MESHY_FIGURINE_UI_WORKFLOW.md`
- `research/FIGURINE_PROVIDER_RESEARCH.md`
- `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`
- `CHECKLIST.md`
- `docs/DEPLOYMENT.md`
- `elliot_quick_dev_Startup.md`
