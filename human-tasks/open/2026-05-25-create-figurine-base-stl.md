# Create Reusable Figurine Base STL

Status: open
Owner: Human
Created: 2026-05-25
Source: `CHECKLIST.md`, user correction after Experiment 003

## Why Human

The deterministic base workflow needs an approved product base shape before code can reliably add customer text or assemble Meshy figurines onto it. This requires product/design judgment and possibly Blender or slicer review before it becomes a versioned manufacturing asset.

## Steps

1. Create or choose the first reusable figurine base STL for the PrintU-like product workflow.
2. Confirm the base has the intended round pedestal style, star or other fixed decoration if desired, enough top surface for feet, and a front zone suitable for customer name text.
3. Verify units, rough dimensions, orientation, and whether the base is watertight in Blender, Bambu Studio, OrcaSlicer, or another mesh tool.
4. Save the base as a local artifact for the next AI developer pass. Preferred target once approved: `services/print-file-generator/assets/figurine-bases/printu-round-v1/base.stl`. If the STL is too large or not ready to track, save it under `.tmp/figurine-bases/printu-round-v1/base.stl` and document that temporary path.
5. Capture the expected text placement zone, font/style preference, raised vs engraved text direction, and any constraints for name length.

## Done When

- A reusable base STL exists at a known local path.
- The base has known units, dimensions, orientation, top plane, and front text zone.
- The base is acceptable for the first deterministic name-on-base experiment.
- Any slicer/Blender warnings are captured for the next implementation pass.

## Evidence To Capture

- Local base STL path.
- Safe screenshots or notes from Blender/slicer, with no account secrets visible.
- Units and approximate dimensions.
- Whether the base is watertight.
- Preferred text style: raised or engraved, approximate size, font direction, and maximum name length.

## Related Files

- `CHECKLIST.md`
- `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`
- `services/print-file-generator`
