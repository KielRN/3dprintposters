# Review Deterministic Customer-Name Base Service

Status: open
Owner: Human
Created: 2026-06-10
Source: `services/print-file-generator/app/figurine_name_base.py`, `services/print-file-generator/assets/figurine-bases/figurine-square-v1/`, `apps/functions/src/index.ts` (`updateFigurineBaseConfig`)

## Why Human

The deterministic customer-name base service is implemented and unit-tested, and as of 2026-06-10 the sign field is wired into the figurine job page. The base asset manifest is still `pending-approval`: lettering legibility, print-quality, and product feel need Elliott's Blender/slicer judgment, and the new in-app sign workflow needs a full browser product-flow test.

## What Was Built

1. `figurine-square-v1` reusable base asset: the gold-standard square base with the baked `Elliott` lettering deterministically removed and the structural bodies unioned into one watertight `105.24mm x 105.24mm x 24.00mm` STL. The manifest records the sloped front name-panel plane and the approved sample lettering style measured from the gold standard (raised `1.94mm` proud of the panel, embedded `0.52mm` behind it).
2. `app/figurine_name_base.py`: validates sign names (max 12 characters; letters, digits, spaces, hyphens, apostrophes, periods), generates DejaVu Sans Bold lettering condensed 0.8x, targets 10mm cap height with shrink-to-fit and a 4mm legibility floor, and boolean-unions the lettering into a single watertight mesh with STL/3MF/preview-GLB exports.
3. `scripts/compose_named_base.py` CLI plus `POST /v1/figurine/named-base` endpoint.
4. `updateFigurineBaseConfig` Firebase callable persisting `baseConfig` and `figurineNamedBase` job metadata, with local `.tmp` mirroring in emulator mode.
5. Base name sign panel on the figurine job page (added 2026-06-10): after the Creative Lab GLB preview renders, the customer can toggle the sign, enter a name (client-side validation mirrors the server rules), generate the named base through `updateFigurineBaseConfig`, and orbit the generated `named-base-preview.glb` in the job page.

## Steps

1. Open the clean base asset `services/print-file-generator/assets/figurine-bases/figurine-square-v1/base.stl` in the current Blender square-base scene and confirm it matches the gold standard minus the lettering.
2. Import `.tmp/experiments/named-base/elliott/named-base.stl` and compare against `.tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl`: lettering placement, proportions, and proud depth should feel equivalent. Note the deterministic font (DejaVu Sans Bold condensed) is wider-set than the PrintU sample font.
3. Review the long-name samples `.tmp/experiments/named-base/sophie-jay/` (5.7mm cap) and `.tmp/experiments/named-base/maximilliana/` (4.8mm cap) and decide whether the 4mm minimum cap height floor is legible enough for sale, or whether the character cap should drop below 12.
4. Slice `named-base.stl` or `named-base.3mf` in Bambu Studio/OrcaSlicer: confirm watertight import, no repair warnings, and that the raised lettering survives slicing at product scale.
5. If approved, flip `status` in `base.manifest.json` from `pending-approval` to `approved` with date/basis. The sign field is already wired into the job page per the build-toward-final-behavior rule; if review rejects the lettering, the next AI developer should fix the production path rather than hide the field.
6. Optional regeneration: `python services/print-file-generator/scripts/compose_named_base.py --name "AnyName" --out .tmp/experiments/named-base/anyname` (deps: trimesh, shapely, manifold3d, matplotlib — added to the service pyproject).
7. Browser product-flow test of the in-app sign workflow using the normal local stack (`elliot_quick_dev_Startup.md`: print-file generator on port 8089, Functions emulator, web dev server):
   - Create or open a figurine job and generate the Creative Lab GLB preview (fixture mode `MESHY_FIGURINE_PROVIDER_MODE=fixture` avoids paid Meshy calls).
   - In the new "Personalize the base" panel under the color preview, enable the sign, enter a name (try `Elliott`, a hyphenated name, and a 12-character name), and save.
   - Confirm the named-base preview GLB renders and orbits, the panel shows the normalized name and `generated` status, and `.tmp/print-files/{uid}/{jobId}/figurine/named-base/figurine-square-v1/` contains `named-base.stl`, `named-base.3mf`, and `named-base-preview.glb`.
   - Try an invalid name (`!!!` or 13+ characters) and confirm the panel blocks it with a clear message instead of calling the backend.
   - Disable the sign and save; confirm the job keeps the cleared `baseConfig` without errors.

## Done When

- The clean `figurine-square-v1` asset and at least one named-base sample pass Blender visual review and slicer validation.
- A decision is recorded on maximum name length vs. minimum legible cap height.
- The manifest status is updated.
- The in-app sign workflow passes the browser product-flow test: valid names generate and preview, invalid names are blocked with clear messages, and disabling the sign saves cleanly.

## Evidence To Capture

- Blender screenshots of the named base next to the gold standard.
- A screenshot of the job-page base sign panel with a generated named-base preview.
- Slicer repair warnings, print time, and material estimates for one named base.
- Any lettering legibility concerns at 4-6mm cap heights.
