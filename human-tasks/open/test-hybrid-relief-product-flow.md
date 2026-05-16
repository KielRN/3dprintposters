# Check Relief Quality In Blender

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
- The next useful validation is a fresh product-flow regeneration in the browser, then Blender inspection of the newly mirrored `.tmp/print-files/{uid}/{jobId}` bundle.

## Checklist

- [ ] Regenerate 3D preview for the approved proof so the job uses the new 400px/768px relief path.
- [ ] Restart the Functions emulator after the timeout fix, then retry approval or **Retry 3D generation** for the affected job.
- [ ] Confirm `metadata.json` shows `target_width_px`/`mesh_target_width_px` behavior through `normalized_width_px: 400` and `geometry_analysis_width_px: 768`.
- [ ] Open latest `model.stl` in Blender.
- [ ] Look at face from low side angle.
- [ ] Check nose. Should look like bump.
- [ ] Check cheeks and forehead. Should look smooth, not chunky.
- [ ] Check eyes, teeth, and skin. Should not look harsh or carved too deep.
- [ ] Check shirt and background. Should not steal attention from face.
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
