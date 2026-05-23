# Heightmap Experiments Final Evaluation

Date: 2026-05-09

2026-05-23 status update: this evaluation is historical support for the parked poster-relief path. The rejection of full image-to-3D reconstruction applies to 5x7 bas-relief posters only. It should now be read as evidence that standalone figurine generation is a better fit for that model class.

## Provider Rename (2026-05-09)

The Experiment 4 provider was renamed from `sam_masked_depth` to `segformer_masked_depth` to reflect the actual implementation (SegFormer/ADE20K via the HF Inference API, not SAM). All references in this document use the new name. Historical artifacts under `.tmp/experiments/experiment_4/sam_masked_depth/` retain the original name as a record of what was actually run, including baked-in `metadata.json` values.

## Executive Decision

The best next production direction is **monocular semantic depth plus subject masking plus a controlled fine-detail layer**.

Experiment 4, `segformer_masked_depth`, is the strongest overall path because it solves the most important product problem: separating the printable subject from distracting background geometry. It should become the basis for the next internal prototype, but it is not ready to replace the checkout default yet.

The current production-safe default, `posterized_luminance`, should remain a deterministic fallback only. It is printable and stable, but it produces chunky terraced faces. `lithophane_baseline` is the best deterministic reference for facial readability, but it preserves too much background texture to ship as-is.

Full image-to-3D reconstruction should be rejected for this product path. Experiment 5 proved that TripoSR/Tripo-style reconstruction solves the wrong problem: it creates standalone 3D objects, not image-plane relief depth.

## Evaluation Inputs

All experiments were evaluated against the two canonical local inputs:

- `.tmp/input_image/Profile-Pic-HIMSS.jpg`
- `.tmp/input_image/Gemini_Generated_Image_lzneejlzneejlzne.png`

Experiment artifacts are under:

- `.tmp/experiments/experiment_1`
- `.tmp/experiments/experiment_2`
- `.tmp/experiments/experiment_3`
- `.tmp/experiments/experiment_4`
- `.tmp/experiments/experiment_5`

Each complete provider run produced the expected bundle:

- `heightmap.png`
- `model.stl`
- `preview.glb`
- `metadata.json`
- `filament-painting/preview.png`

## Structural Result

All completed provider runs generated technically valid print-file bundles:

| Metric | Result |
| --- | --- |
| Output plate size | 127.0 mm x 177.8 mm |
| Heightmap size | 200 x 280 |
| Heightmap PNG mode | 16-bit |
| Triangle count | 223,996 |
| Binary STL size | 11,199,884 bytes |
| Watertight | true |
| Relief height range | About 1.6 mm to 4.2 mm |

This is useful, but it should not be confused with product readiness. A provider can be watertight and printable while still producing a visually poor poster relief.

## Provider Verdicts

| Experiment | Provider | Verdict | Product meaning |
| --- | --- | --- | --- |
| 1 | `posterized_luminance` | Wired, printable, fallback only | Stable but visibly blocky. Keep as deterministic safety baseline. |
| 1 | `continuous_luminance` | Wired, printable, fallback/reference only | Smoother than posterized, but still mistakes brightness for depth. |
| 1 | `lithophane_baseline` | Wired, printable, best deterministic reference | Preserves the most face/detail information, but also turns background texture into geometry. |
| 2 | `depth_anything_v2_small` | Wired, printable, correct problem class | Produces image-plane semantic depth and good subject/background structure, but portrait faces are too smooth. |
| 3 | `depth_anything_v2_small_bas_relief` | Wired, printable, useful scaffolding | Current transform is too subtle to prove visual improvement over Experiment 2. Needs a stronger bas-relief method. |
| 4 | `segformer_masked_depth` | Wired, printable, best next candidate | Best subject/background separation. Strongest direction for product, but still needs facial/detail recovery and provider hardening. |
| 5 | `triposr_sidecar` | Wired, printable, rejected | Full 3D reconstruction creates object silhouettes/figurines, not poster relief depth. Do not continue this path for bas-relief posters. |

## Experiment 1: Deterministic Providers

### What Worked

Experiment 1 gave a valuable deterministic baseline. It confirmed that the existing mesh pipeline is stable across multiple height providers and that all providers can stay inside the same printability envelope.

`lithophane_baseline` was the strongest deterministic visual result:

- On the portrait, it preserved eyes, smile, face contours, shirt folds, and edges better than `posterized_luminance` or `continuous_luminance`.
- On the Gemini artwork, it preserved character and environment detail more clearly than the other luminance providers.

### What Failed

All three deterministic providers are still brightness-to-height mappings. That is the wrong semantic model for the product.

Observed issues:

- Dark hair, shirts, shadows, and background gradients become geometry even when they are not spatial depth.
- `posterized_luminance` creates obvious height bands across faces and clothing.
- `continuous_luminance` removes the hard bands but makes portraits soft and muddy.
- `lithophane_baseline` keeps detail but also keeps background noise and decorative texture.

### Experiment 1 Decision

Keep:

- `posterized_luminance` as the deterministic fallback.
- `lithophane_baseline` as a detail-reference layer for future blending.

Do not make any Experiment 1 provider the production target.

## Experiment 2: Depth Anything V2 Small

### What Worked

`depth_anything_v2_small` moves the pipeline into the correct problem class: monocular image-plane depth.

Compared with luminance providers, it:

- Preserves the original image framing.
- Produces coherent foreground/background separation.
- Avoids treating every dark pixel as a raised or recessed surface.
- Works much better for the Gemini artwork subject silhouette.

The heightmaps are radically different from `posterized_luminance`, with mean absolute 16-bit differences of:

| Input | Mean abs diff vs `posterized_luminance` | 95th percentile diff |
| --- | ---: | ---: |
| Profile-Pic-HIMSS | 10,425 | 24,800 |
| Gemini image | 22,744 | 44,587 |

### What Failed

The portrait result is semantically plausible but identity-poor. The face becomes a smooth head-and-shoulders relief with only broad nose/face structure. It does not preserve the eyes, smile, and expression as well as the lithophane baseline.

This means semantic depth alone is not enough for the product. It needs a controlled detail layer.

### Experiment 2 Decision

Keep as the base depth provider for the next product candidate, but do not ship it directly.

## Experiment 3: Bas-Relief Transform

### What Worked

`depth_anything_v2_small_bas_relief` is correctly wired as a separate provider and keeps the same printability profile as Experiment 2.

The provider is useful scaffolding because it gives us a clear place to add real bas-relief compression logic between semantic depth and mesh generation.

### What Failed

The current transform is too subtle. The measured deltas from Experiment 2 are small:

| Input | Mean abs diff vs Experiment 2 | 95th percentile diff | Pixels changed |
| --- | ---: | ---: | ---: |
| Profile-Pic-HIMSS | 146 | 351 | 96.6% |
| Gemini image | 227 | 1,298 | 77.0% |

For a 16-bit heightmap, these differences are small enough that the visual result is effectively close to the raw Depth Anything output. The transform is wired, but it does not yet prove a meaningful quality improvement.

### Experiment 3 Decision

Keep the provider boundary, but treat the current implementation as a placeholder. Replace or strengthen it with a real bas-relief postprocessor before it becomes a production quality claim.

Recommended changes:

- Add acceptance tests that catch near-no-op transforms.
- Try stronger gradient-domain reconstruction or tone-curve compression.
- Evaluate by facial feature readability, not just numeric pixel movement.

## Experiment 4: Subject Mask Layering

### What Worked

`segformer_masked_depth` is the strongest candidate from the completed experiments.

On the portrait, it clearly suppresses background geometry and raises the subject relationship:

| Portrait metric | Experiment 3 | Experiment 4 | Change |
| --- | ---: | ---: | ---: |
| Mean 16-bit heightmap value | 34,848 | 31,710 | -9.0% |
| Standard deviation | 22,193 | 24,933 | +12.3% |
| Mean abs diff vs Experiment 3 | n/a | 3,138 | n/a |
| 95th percentile diff vs Experiment 3 | n/a | 11,778 | n/a |
| Pixels changed vs Experiment 3 | n/a | 96.2% | n/a |

On the Gemini image, the improvement is milder but still directionally good:

| Gemini metric | Experiment 3 | Experiment 4 | Change |
| --- | ---: | ---: | ---: |
| Mean 16-bit heightmap value | 26,319 | 24,417 | -7.2% |
| Standard deviation | 24,683 | 24,733 | +0.2% |
| Mean abs diff vs Experiment 3 | n/a | 1,903 | n/a |
| 95th percentile diff vs Experiment 3 | n/a | 16,582 | n/a |
| Pixels changed vs Experiment 3 | n/a | 51.5% | n/a |

The practical visual result is:

- Portrait background is flatter and less distracting.
- Subject silhouette reads better.
- Mask transition is soft enough to avoid an obvious hard cutout ridge.
- Gemini subject/background separation improves, especially around railing/boardwalk regions.

### What Failed

Experiment 4 does not solve all portrait quality issues.

Remaining problems:

- Facial identity is still too smooth because the base semantic depth has little eye/smile detail.
- The torso/shirt region can still carry unnecessary texture or broad height.
- The provider was originally registered as `sam_masked_depth`, but the implementation uses HF Inference API segmentation with `nvidia/segformer-b0-finetuned-ade-512-512`, not an actual SAM model. The provider was renamed to `segformer_masked_depth` on 2026-05-09 to match the implementation.
- Foreground/background classification depends on a fixed ADE20K label list and a hardcoded `background_scale = 0.3`.
- API latency, cost, caching, and failure behavior still need production review.

### Experiment 4 Decision

Make Experiment 4 the base for the next internal prototype, not the checkout default.

The next prototype should be a hybrid provider:

```text
source image
  -> Depth Anything V2 Small for low-frequency semantic shape
  -> segmentation mask for subject/background separation
  -> subject-only fine-detail layer from lithophane/luminance/edges
  -> stronger bas-relief compression
  -> existing deterministic STL/GLB/metadata pipeline
```

Suggested provider name:

- `masked_depth_detail_blend`

## Experiment 5: TripoSR Sidecar

### What Worked

The provider successfully generated technically valid print-file bundles through the same final pipeline:

- `height_provider = triposr_sidecar`
- `watertight = true`
- `triangle_count = 223,996`
- `binary_stl_bytes = 11,199,884`

This proves the sidecar integration path can run, download a mesh, project it, and feed the normal mesh builder.

### What Failed

The result is visually and conceptually wrong for this product.

TripoSR/Tripo-style image-to-3D reconstruction builds a standalone 3D object from an image. A poster relief needs depth within the original image frame.

Observed mismatch:

- Portrait input became a side-profile head/body silhouette with no expression fidelity.
- Gemini artwork became a small standalone figure and discarded the poster environment.
- Original composition, framing, background, and image-plane relationships were lost.

The Gemini heightmap also shows the problem numerically: its median 16-bit heightmap value is 0, which means most of the image frame is empty/background after object projection.

### Experiment 5 Decision

Reject full image-to-3D sidecars for the bas-relief poster product.

Do not continue near-term bas-relief work on:

- Stable Fast 3D
- TRELLIS
- SAM 3D Objects
- TriplaneGaussian
- Other full object reconstruction models

Revisit only if the product expands into standalone figurines or object sculptures.

## Overall Quality Ranking

For the current 5x7 poster relief product:

| Rank | Provider/path | Reason |
| ---: | --- | --- |
| 1 | `segformer_masked_depth` plus future fine-detail blend | Best composition and subject/background separation. Needs detail recovery. |
| 2 | `depth_anything_v2_small` | Correct base depth signal, but too smooth alone. |
| 3 | `depth_anything_v2_small_bas_relief` | Good provider boundary, but current transform is not strong enough. |
| 4 | `lithophane_baseline` | Best deterministic identity/detail reference, but background/noise heavy. |
| 5 | `continuous_luminance` | Smoother fallback reference, still brightness-as-depth. |
| 6 | `posterized_luminance` | Stable fallback, visibly blocky. |
| 7 | `triposr_sidecar` | Rejected for poster relief. Solves the wrong problem. |

## Recommended Next Work

1. Keep `posterized_luminance` as the default checkout fallback until the user explicitly approves a production provider change.
2. Add a new opt-in provider, `masked_depth_detail_blend`, based on Experiment 4.
3. Blend detail only inside the subject mask:
   - low-frequency shape from Depth Anything V2 Small,
   - subject/background control from segmentation,
   - capped high-frequency detail from `lithophane_baseline`, luminance edges, or both.
4. Replace the current Experiment 3 transform with a stronger bas-relief postprocessor or add parameters that produce measurable, visible compression.
5. ~~Rename `sam_masked_depth` or switch the implementation to actual SAM before production.~~ Done 2026-05-09: provider renamed to `segformer_masked_depth` to match the actual SegFormer/ADE20K implementation.
6. Add a small visual acceptance harness that writes comparison sheets for every candidate:
   - source image,
   - deterministic fallback,
   - depth-only,
   - masked depth,
   - detail-blended candidate,
   - difference map.
7. Add quality gates beyond printability:
   - subject/background separation,
   - portrait identity readability,
   - background flatness,
   - no hard mask ridge,
   - no high-frequency printable noise,
   - acceptable latency/cost/license.

## Final Recommendation

Mark the five-experiment cycle complete.

The path forward is **not** full 3D generation. It is a server-side relief pipeline that combines:

- semantic depth,
- subject masking,
- controlled subject detail,
- real bas-relief compression,
- the existing deterministic STL/GLB generator.

Experiment 4 is the best foundation. Experiment 1's `lithophane_baseline` should supply the detail reference. Experiment 3 should become the real compression stage. Experiment 5 should stay rejected for this product.
