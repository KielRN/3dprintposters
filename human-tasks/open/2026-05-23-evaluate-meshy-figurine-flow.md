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
- Experiment 002 is prepared for the start of the next chat as `npm run meshy:exp-002-multiview`. It will create paid Meshy Image-to-Image multi-view and Multi-Image-to-3D tasks, download local artifacts, and run Meshy printability analysis. Elliot will close the loop in chat when the experiment finishes and provide visual/printability judgment.

## Related Files

- `docs/MESHY_FIGURINE_UI_WORKFLOW.md`
- `research/FIGURINE_PROVIDER_RESEARCH.md`
- `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`
- `CHECKLIST.md`
- `docs/DEPLOYMENT.md`
- `elliot_quick_dev_Startup.md`
