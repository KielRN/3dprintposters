# Evaluate Meshy Figurine Flow And Create Webhook

Status: open
Owner: Human
Created: 2026-05-23
Source: `research/FIGURINE_PROVIDER_RESEARCH.md`, Meshy webhook docs, user note that local `.env` contains `MESHY_API_KEY`

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
5. For each useful generation, capture safe notes: style, posture, time, credits/cost, output formats available, whether GLB/STL/3MF download works, and whether the model looks sellable.
6. Open the generated STL/3MF in Bambu Studio, OrcaSlicer, or another slicer and note printability issues: scale, supports, fragile parts, color mapping, warnings, and estimated print time/material.
7. Cloudflare-backed HTTPS receiver is created and smoke-tested. Use payload URL `https://api.3dprintyou.com/webhooks/meshy`.
8. `MESHY_WEBHOOK_SECRET` is present in local `.env` and uploaded as an encrypted Cloudflare Worker secret. A real Meshy delivery confirmed the secret arrives in `x-meshy-api-webhook-secret-key`, and the Worker now rejects webhook POSTs without the matching secret.
9. Meshy API settings webhook is active and delivered real `PENDING` and `FAILED` events to the Worker.
10. For future Cloudflare automation, expand or replace the local Cloudflare API token. On 2026-05-23 the current root `.env` token verified successfully and could see both project zones, but returned `403` for DNS record and Worker route reads.

## Done When

- Meshy output quality is classified as promising, weak, or not viable for the first figurine MVP.
- We know which style/posture combinations should appear in the app first.
- We know whether GLB/STL/3MF files are downloadable and usable in slicer.
- We know whether a Meshy webhook is configured, or what blocked setup.
- The next AI developer can implement either polling-only Meshy integration or webhook receiver work with clear constraints.

## Evidence To Capture

- Safe screenshots of generated previews, with no account secrets visible.
- Meshy task ids are okay if useful.
- Local artifact paths for downloaded GLB/STL/3MF files.
- Credit/cost notes without exposing payment details.
- Slicer warnings and print-time/material estimates.
- Webhook proxy/deployed URL only if it is safe and intended to be used by the app.
- Test task `019e562e-06ea-7e78-b3e6-98651023fae2` delivered `PENDING` and `FAILED` webhook events, failed at 15% progress, and reported `0` consumed credits. It was useful for webhook/header verification, not output-quality evaluation.

## Related Files

- `research/FIGURINE_PROVIDER_RESEARCH.md`
- `CHECKLIST.md`
- `docs/DEPLOYMENT.md`
- `elliot_quick_dev_Startup.md`
