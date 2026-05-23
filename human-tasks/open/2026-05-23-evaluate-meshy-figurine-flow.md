# Evaluate Meshy Figurine Flow And Create Webhook

Status: open
Owner: Human
Created: 2026-05-23
Source: `research/FIGURINE_PROVIDER_RESEARCH.md`, Meshy webhook docs, user note that local `.env` contains `MESHY_API_KEY`

## Why Human

This needs Elliot's Meshy account, dashboard access, visual judgment, and a public HTTPS webhook URL. Meshy webhook creation is documented as a dashboard action in the Meshy API settings page, not a REST API call. Use Cloudflare for the receiver rather than a temporary webhook proxy.

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
7. Refresh or replace the local Cloudflare API token. The current root `.env` token is present but returned `401` from Cloudflare token verification on 2026-05-23.
8. Create a Cloudflare-backed HTTPS receiver for Meshy, preferably `https://api.3dprintyou.com/webhooks/meshy`.
9. In Meshy API settings, find **Webhooks**, click **Create Webhook**, and enter the Cloudflare receiver URL.
10. Enable the webhook and trigger a low-risk Meshy task if you want to confirm delivery. Do not spend credits on extra generations unless the result is useful for provider evaluation.

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

## Related Files

- `research/FIGURINE_PROVIDER_RESEARCH.md`
- `CHECKLIST.md`
- `docs/DEPLOYMENT.md`
- `elliot_quick_dev_Startup.md`
