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
- Codex checked `heightmap.png` against `model.stl`.
- STL is reading heightmap correctly.
- Not likely an STL polarity bug.
- More likely: heightmap shape, relief tuning, blocky mesh, Blender lighting, or shading.

## Checklist

- [ ] Open latest `model.stl` in Blender.
- [ ] Look at face from low side angle.
- [ ] Check nose. Should look like bump.
- [ ] Check cheeks and forehead. Should look smooth, not chunky.
- [ ] Check eyes, teeth, and skin. Should not look harsh or carved too deep.
- [ ] Check shirt and background. Should not steal attention from face.
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
