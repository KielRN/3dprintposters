# Approve Reusable Figurine Base STL

Status: done
Owner: Human
Created: 2026-05-25
Completed: 2026-06-03
Source: `CHECKLIST.md`, user correction after Experiment 003

## Why Human

The deterministic base workflow needs an approved product base shape before code can reliably add customer text or assemble Meshy figurines onto it. Elliot accepted the sliced-front base after reviewing the centered, partially embedded `Elliott` text preview.

Candidate asset created on 2026-06-02 and revised after visual review:

- `services/print-file-generator/assets/figurine-bases/printu-round-v1/base.stl`
- `services/print-file-generator/assets/figurine-bases/printu-round-v1/base.blend`
- `services/print-file-generator/assets/figurine-bases/printu-round-v1/base.manifest.json`
- `services/print-file-generator/assets/figurine-bases/printu-round-v1/previews/elliott/base-with-elliott-preview.png`
- `services/print-file-generator/assets/figurine-bases/printu-round-v1/previews/elliott/preview.metadata.json`

Local mesh verification reported the revised STL as watertight with consistent winding, `1610` faces, `807` vertices, `69.997mm x 61.5mm x 16.0mm` extents, and SHA-256 `da3c93cc0363369eb9fc5c05b11eb5125efa490188f8152ed3767c5ee326f3a1`.

Approved default name style from the `Elliott` preview: smaller raised lettering, centered in the flat front rectangle, partially embedded into the structure. Preview metadata records text bounds, size, extrusion, bevel, proud depth, and embedded depth.

## Steps

1. Open the candidate `base.blend` and `base.stl`. Done.
2. Confirm the base has the intended sliced-round pedestal style, enough top surface for feet, and a straight flat front face suitable for customer name text. Done.
3. Verify units, rough dimensions, orientation, and whether the base remains acceptable in Blender, Bambu Studio, OrcaSlicer, or another mesh tool. Local mesh verification done; slicer review can still happen during fulfillment validation.
4. Decide whether v1 should stay undecorated or needs a fixed star/decoration baked into the base STL before the name-on-base service is built. Done: keep base unpersonalized and undecorated; deterministic name geometry is added later.
5. Capture the expected text placement zone, font/style preference, raised vs engraved text direction, and any constraints for name length. Done in `base.manifest.json` and `previews/elliott/preview.metadata.json`.

## Done When

- A reusable base STL is accepted.
- The base has known units, dimensions, orientation, top plane, and front text zone.
- The base is acceptable for the first deterministic name-on-base experiment.
- Slicer/physical-print review remains a later fulfillment-readiness validation, not a blocker for starting the deterministic name service.

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
