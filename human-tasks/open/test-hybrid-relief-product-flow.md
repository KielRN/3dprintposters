# Check Super Dad Relief Quality In Browser And Blender

Status: open
Owner: Human
Created: 2026-05-11
Source: `AI_DEVELOPER_NOTES.md`, Blender review, latest local print-file bundle

## Why Human

Human eyes needed. Blender view tells us if poster relief looks good enough.

## What We Know

- Gray pictures are from Blender.
- Print files still look blocky.
- Face relief still feels wrong in places.
- Nose can look like dent, not bump.
- 2026-05-15 follow-up: still concerned the nose is recessing rather than protruding on the 3D print surface.
- 2026-05-15 follow-up: still seeing a lot of blockiness at edges, including subject/shirt boundaries.
- 2026-05-15 follow-up: app viewer screenshot also shows very blocky/jagged edges around the head silhouette, ear, neck, and shirt boundary, so this is visible in the product preview and not only in Blender.
- 2026-05-15 follow-up: next AI chat should assess whether increasing final output resolution is practical if the printer can support it, and compare typical resolution expectations for the intended target printer versus a consumer printer such as the Bambu X2D. Current specs should be verified before relying on an answer.
- Codex checked `heightmap.png` against `model.stl`.
- STL is reading heightmap correctly.
- Not likely an STL polarity bug.
- More likely: heightmap shape, relief tuning, blocky mesh, Blender lighting, or shading.
- 2026-05-15 implementation follow-up: the production approval path now uses 768px geometry analysis, 400px mesh/color output, geometry-only proof cleanup, contour-smoothed subject masks, and nose-aware portrait shaping.
- 2026-05-16 implementation follow-up: approval was timing out at the default ~60-second callable limit even though the Python generator returned `200 OK`; the Functions callable and browser client now allow 9 minutes.
- 2026-05-16 implementation follow-up: the latest retry generated successfully after about 197 seconds, with artifacts mirrored to `.tmp`; the app now marks jobs `generated` before that optional local mirror finishes.
- 2026-05-17 implementation follow-up: the nose-specific height boost was removed after Blender review showed a puppet-like nose. The hybrid path now uses lower photo-detail weight, broader face smoothing, a face/forehead pit guard, and `debug/*.png` relief-stage artifacts.
- 2026-05-17 product-direction follow-up: the "Super Dad" generated proof is now the MVP north star. The goal is a HueForge-like controlled poster product, not raw photo-to-relief. Smooth skin/scalp/neck/body surfaces should stay smooth unless the style explicitly calls for texture; text, logos, emblems, and graphic panel lines should stay crisp and raised.
- 2026-05-17 latest review: face smoothness is improving, but top-of-head/scalp and neck still look very rough. Treat this as the next relief-quality target after the documentation update.
- The next useful validation is a fresh product-flow regeneration in the browser, then Blender inspection of the newly mirrored `.tmp/print-files/{uid}/{jobId}` bundle.

## Checklist

- [ ] Regenerate 3D preview for the approved proof so the job uses the latest 400px/768px relief path without the nose boost.
- [ ] Restart the Functions emulator after the timeout fix, then retry approval or **Retry 3D generation** for the affected job.
- [ ] Confirm `metadata.json` shows `target_width_px`/`mesh_target_width_px` behavior through `normalized_width_px: 400` and `geometry_analysis_width_px: 768`.
- [ ] Confirm `metadata.json` provider settings show `detail_weight: 0.12`, `portrait_nose_boost: disabled`, `face_pit_guard: enabled`, and `debug_artifacts: enabled`.
- [ ] Open the mirrored `debug/` folder and compare `geometry-input.png`, `detail-layer.png`, `relief-depth.png`, and `final-heightmap.png` if the face still looks wrong.
- [ ] Compare the generated proof and 3D output against the Super Dad north star: smooth stylized skin, smooth scalp/top-of-head, smooth neck, clean body volumes, crisp raised text/logos, and simple backgrounds.
- [ ] Open latest `model.stl` in Blender.
- [ ] Look at face from low side angle.
- [ ] Check nose. It should not look recessed, but it also should not look like a separate puppet/clown bump.
- [ ] Check cheeks and forehead. They should look smooth, not chunky, and the forehead should not have a pit/hole.
- [ ] Check eyes, teeth, and skin. Should not look harsh or carved too deep.
- [ ] Check top-of-head/scalp, ears, and neck. These should be smooth by default and should not show rough photo/proof texture unless a future style explicitly asks for it.
- [ ] Check shirt and background. Should not steal attention from face.
- [ ] Check text, logos, emblems, and graphic panel lines if present. These should remain crisp and intentionally raised, not blurred away by smooth-surface tuning.
- [ ] Check head, ear, neck, and shirt boundaries in the app preview. Edges should look less jagged than the previous 280px output.
- [ ] Take screenshot if something looks bad.
- [ ] Write short note: what looks wrong, where on face/body, and whether it is dent, block, ridge, or noise.

## Done When

- [ ] We know the biggest visual problem.
- [ ] We have screenshot or short note.
- [ ] Next AI fix target is clear.

## Safe Evidence

- Job id is okay.
- Local artifact path is okay.
- Screenshot is okay.
- Do not paste secrets.
