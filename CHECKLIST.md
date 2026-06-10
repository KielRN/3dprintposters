# Active Checklist

Last updated: 2026-06-08

This is the short working checklist for the current product focus: the Meshy-backed personalized figurine service on `3dprintyou.com`.

Historical implementation history was archived to `docs/archive/CHECKLIST-legacy-2026-05-24.md`. Completed chronology belongs in `CHANGELOG.md`; detailed contracts belong in `docs/` and `research/`.

## Current Goal

Prove whether Meshy can power the first customer-facing figurine workflow:

1. Customer uploads a photo.
2. Customer chooses style and posture.
3. Backend creates a 2D proof.
4. Backend sends the approved proof/source to Meshy.
5. First target workflow uses Emoji/avatar style with Natural pose.
6. App stores generated GLB/STL/3MF artifacts.
7. Job page shows an honest 3D preview and readiness/warning state.
8. Product chooses lead capture, preorder/manual fulfillment, or checkout based on real output quality.

## Done

- [x] Choose `3dprintyou.com` as the primary domain for the figurine pivot.
- [x] Research MakerWorld PrintU as the UX reference: photo upload, style choice, posture choice, 2D proof, 3D figurine output.
- [x] Map the user-provided PrintU screenshots into the detailed target UI workflow in `docs/MESHY_FIGURINE_UI_WORKFLOW.md`.
- [x] Research Meshy as the first generated-3D provider candidate.
- [x] Deploy the Meshy webhook receiver at `https://api.3dprintyou.com/webhooks/meshy`.
- [x] Disable the default `workers.dev` trigger for the Meshy webhook Worker.
- [x] Upload `MESHY_WEBHOOK_SECRET` as an encrypted Cloudflare Worker secret.
- [x] Confirm real Meshy webhook delivery headers: `x-meshy-api-webhook-secret-key` and `x-meshy-api-webhook-user-id`.
- [x] Enforce Meshy webhook authentication with `x-meshy-api-webhook-secret-key`.
- [x] Run a real Meshy webhook delivery test. Task `019e562e-06ea-7e78-b3e6-98651023fae2` delivered `PENDING` and `FAILED` events with `0` consumed credits, proving delivery/security but not output quality.
- [x] Generate the first successful Meshy Image to 3D output and download GLB/STL/3MF artifacts. Details live in `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`.
- [x] Generate a full-body Emoji/avatar Natural pose 2D concept and run it through Meshy Image to 3D. Task `019e5c65-7b2b-7641-abd6-ed04fb4e3d2e` succeeded, consumed `30` credits, and downloaded GLB/STL/3MF artifacts under `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z`.
- [x] Run Meshy printability analysis on the Emoji/avatar output. Analysis task `019e5c69-3d55-76ec-aecf-7cd728e6ed38` consumed `0` credits and returned `error`, with `is_watertight: false`, `125` non-manifold edges, and `112` degenerate faces.
- [x] Prepare Experiment 002 as a named repeatable runner: `npm run meshy:exp-002-multiview`. The script is documented as Meshy Experiment 002 and will create a Meshy Image-to-Image multi-view task, pass it to Meshy Multi-Image-to-3D, download assets, and run Meshy printability analysis.
- [x] Run Experiment 002 with Meshy Image-to-Image multi-view -> Multi-Image-to-3D -> printability analysis. Image task `019e5ef8-cc6c-7540-9b86-f8d0f519bc9d` consumed `12` credits, model task `019e5ef9-cc0d-758e-b1c2-f0a61932e3b6` consumed `30` credits, downloaded GLB/STL/3MF artifacts under `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-2026-05-25T11-50-24-757Z`, and printability task `019e5efc-09fc-7db6-a22a-a4eb50f9b338` returned `error`.
- [x] Run Experiment 002 B with the PrintU-style round base reference and front base label `Elliott`. Image task `019e5f1f-d682-77d3-b332-0808a10a1d34` consumed `12` credits, model task `019e5f20-db96-79f3-9169-943c310121cd` consumed `30` credits, downloaded GLB/STL/3MF artifacts under `.tmp/experiments/meshy/exp-002b-emoji-natural-base-2026-05-25T12-33-03-165Z`, and printability task `019e5f23-4277-7abb-b7fc-9a4396b0d3e5` returned `error`.
- [x] Close Experiment 002/002 B as the Meshy-generated-base/text cycle. Use Experiment 003 for deterministic base geometry after Meshy instead of asking Meshy to preserve the base star or customer text.
- [x] Prepare Experiment 003 as a named repeatable runner: `npm run meshy:exp-003-deterministic-base`. The script will run the same Meshy multi-view -> Multi-Image-to-3D flow, then locally add a deterministic PrintU-style round base with a raised center star after Meshy asset download.
- [x] Run Experiment 003 with deterministic post-Meshy base geometry. Image task `019e5fe6-81d9-7f24-9add-bbd37e6ff6f4` consumed `12` credits, model task `019e5fe7-81fc-742c-ab8a-8516bd549134` consumed `30` credits, downloaded assets under `.tmp/experiments/meshy/exp-003-deterministic-printu-star-base-2026-05-25T16-10-02-213Z`, and printability task `019e5fe9-c09e-7093-a81d-847899b14db9` returned `error`.
- [x] Analyze Experiment 002, 002 B, and 003 Meshy artifacts in Blender plus direct 3MF inspection. Meshy's `model.3mf` files are millimeter-scaled at `75mm` tall, while raw `model.stl` opens in Blender around `1911` units tall and raw `model.glb` around `1.91` units tall.
- [x] Clarify the deterministic base architecture: Vertex/Gemini and Meshy should produce the figurine/body object; the product base, star, customer name, and final body/base assembly should be deterministic server-side manufacturing steps using a saved base STL asset.
- [x] Prepare Experiment 004 as a normalizer mode on the existing Meshy runner: `npm run meshy:exp-004-normalize-glb`. It runs the usual Meshy flow, then normalizes the downloaded GLB using Meshy's 3MF millimeter height as the scale reference.
- [x] Smoke-test the normalizer without new paid Meshy tasks against Experiment 002. Normalized GLB and normalized STL outputs both import in Blender at about `32.86mm x 19.50mm x 75.00mm`; normalized GLB remains seam-heavy (`~26k` non-manifold edges), while normalized STL preserves Meshy's lower `57` non-manifold edge count.
- [x] Run paid Experiment 004 with `npm run meshy:exp-004-normalize-glb`. Image task `019e619e-53d7-7c77-b65b-1aa28c788d97` and model task `019e619f-2529-7cb4-8d0c-1aaf57442e5e` succeeded, assets downloaded under `.tmp/experiments/meshy/exp-004-normalize-glb-2026-05-26T00-10-26-648Z`, normalized GLB-source outputs exported at `28.86mm x 28.86mm x 75mm`, and printability task `019e61a1-3a10-7302-8c37-b75b33732da6` still returned `error`.
- [x] Fix the local Vertex/Gemini concept prompt and Meshy multi-view prompt so body-generation runs explicitly request no base/pedestal/platform/nameplate; Meshy also ignores/removes an upstream reference base unless a base experiment deliberately passes `--base-label`.
- [x] Standardize future Meshy experiments on one end-to-end runner: `npm run meshy:experiment -- -- --experiment-slug <slug>`, implemented in `scripts/meshy/run-standard-figurine-experiment.mjs`.
- [x] Archive legacy Meshy experiment runners under `scripts/meshy/archive/2026-05-26-legacy-runners/` and remove old npm aliases so the active command list exposes one experiment protocol.
- [x] Create a first candidate reusable base asset at `services/print-file-generator/assets/figurine-bases/printu-round-v1/`. The exported `base.stl` is a single-body sliced-round beveled pedestal with a flat front name face, locally verified watertight with consistent winding at about `70.0mm x 61.5mm x 16.0mm`; the `base.manifest.json` records placement zones and checksum.
- [x] Approve `printu-round-v1` as the reusable figurine base. The clean `base.stl` remains unpersonalized, while `previews/elliott/` records the accepted raised-text placement: smaller, lower, centered in the flat front rectangle, and partially embedded into the structure.
- [x] Define the base asset manifest: base version, units, dimensions, top plane, foot-placement zone, customer-name text zone, default raised-text style, checksum, and storage location.
- [x] Run paid Experiment 005 with `npm run meshy:exp-005-standard`. Vertex/Gemini produced a body-only Emoji/avatar Natural pose concept, Meshy Image-to-Image task `019e8fb7-537c-7253-8f0c-d21aa8bea901` and Multi-Image-to-3D task `019e8fb8-2c15-712d-9947-e3063f1bf9d7` succeeded, assets downloaded under `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z`, normalized outputs exported at about `41.69mm x 22.02mm x 75mm`, and Meshy printability task `019e8fba-1fc7-72b7-bfc3-3740b7076250` returned `error`.
- [x] Run Meshy Repair Printability on Experiment 005. Repair task `019e8fd3-522b-76e2-9a46-320663626dad` succeeded, consumed `10` credits, downloaded `repair/input-task-glb/model.repaired.glb`, and follow-up analyze task `019e8fd3-7df0-76e4-89a3-4f4a2d0c0fad` improved printability from `error` to `warning`.
- [x] Run Meshy Remesh on Experiment 005 original GLB with quad topology and `100000` target polycount. Remesh task `019e8fdb-5755-77fa-a508-195e3f672c92` succeeded, consumed `5` credits, downloaded GLB/STL/3MF under `remesh/quad-100k-original-glb/`, and follow-up analyze task `019e8fdc-3187-7f21-a732-7576411301dd` still returned `error`.
- [x] Run Experiment 006 with Meshy Creative Lab Figure. Prototype task `019e936d-9a37-74cd-9745-76fbf6a3f810` and build task `019e936d-f297-7a35-9bc4-ec2b132b66fe` succeeded, raw provider outputs landed under `.tmp/experiments/meshy/20260604-exp006-creative-lab-raw`, and local normalization is skipped for Blender review. Meshy printability task `019e93f1-a3fe-7762-a70c-09e1bcee6559` still returned `error`, and the provider-generated concept/build included a base.
- [x] Run Experiment 007 as a second raw Creative Lab Figure pass. Prototype task `019e9400-69ac-7b29-8f42-c615f03b1654` and build task `019e9401-d6a9-7a9a-96b1-3a72a89a2f88` succeeded, outputs landed under `.tmp/experiments/meshy/20260604-1358-exp007-creative-lab-raw`, local normalization was skipped, and Meshy printability task `019e9403-c5f3-7b95-af5d-fca1c664c921` returned `error`. The mustache did not repeat, but the provider-generated base did.
- [x] Pause Creative Lab Figure API experiments for now. The outputs are visually appealing, but the endpoint is too opaque for the first controlled body-only workflow and repeatedly includes a provider-generated base. Multi-Image-to-3D is currently the leading Meshy path.
- [x] Prepare Experiment 008 as a raw Multi-Image-to-3D provider-diagnostics command: `npm run meshy:exp-008-raw-provider-diagnostics`. It skips local normalization, deterministic base composition, and Meshy's generation-time remesh, preserves raw provider artifacts first, then runs Meshy Analyze Printability, Repair Printability, and Remesh diagnostics.
- [x] Run paid Experiment 008 with raw Meshy Multi-Image-to-3D output and provider diagnostics. Image task `019e94e3-0e30-7898-aa43-d3b73b8a7705` consumed `12` credits, raw model task `019e94e3-e649-78b6-9fb7-8227d6cb505c` consumed `30` credits with `should_remesh: false`, and assets landed under `.tmp/experiments/meshy/standard/exp-008-raw-multiview-provider-diagnostics-2026-06-04T23-06-01-301Z`. Raw printability task `019e94e5-d733-7903-a321-2c6f16deedaf` returned `error`; Repair Printability task `019e94e6-0089-7cce-883f-44b60fd3ba73` consumed `10` credits and follow-up analyze task `019e94e6-2c2f-7cd5-926a-6236cd1e978e` returned `warning`; Remesh task `019e94e6-567e-7919-8ba5-c7453eef244a` consumed `5` credits and follow-up analyze task `019e94e7-2a15-7b18-8b2f-bf62c9d89fa2` still returned `error`.
- [x] Set up Experiment 009 as `npm run meshy:exp-009-creative-lab-raw` for raw Creative Lab Figure API runs with no local normalization.
- [x] Run Experiment 009 three times. Pass 1 output: `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-1`, prototype task `019e981c-5d82-732e-9980-90c4a1adeab0`, build task `019e981c-b693-7f5f-8325-40b63fdf278b`, printability task `019e981e-79b5-709b-a399-7368a7055a51`, status `error` with `20` non-manifold edges and `3877` degenerate faces.
- [x] Run Experiment 009 pass 2. Output: `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-2`, prototype task `019e981e-e2a4-7dce-b5fa-5ff88a94b658`, build task `019e981f-3b5b-7de7-a4f2-c0034e0d90aa`, printability task `019e9821-26e1-715c-b3c4-4d182bd496f0`, status `error` with `6` non-manifold edges and `4418` degenerate faces.
- [x] Run Experiment 009 pass 3. Output: `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-3`, prototype task `019e9821-862c-7cb5-b60c-4403136f4423`, build task `019e9821-dcad-7ce0-b095-1b5ffc85fdc1`, printability task `019e9823-c7ff-71d4-96e4-d2fc77c03f28`, status `error` with `3` non-manifold edges and `4055` degenerate faces.
- [x] Approve the Creative Lab Figure API GLB generation step as the current figurine workflow milestone: source photo -> Meshy Creative Lab Figure prototype/build -> smooth, no-base GLB asset ingestion. Experiment 009 is the evidence set; printability/format conversion remains a separate downstream step.
- [x] Add Experiment 010 downstream-only print tooling to the standard runner as `npm run meshy:exp-010-print-tools`, using `model_url` from live Creative Lab build GLB URLs with local data-URI fallback.
- [x] Run Experiment 010 from the existing Experiment 009 GLBs without creating new figure-generation tasks. Outputs: `.tmp/experiments/meshy/standard/exp-010-creative-lab-print-tools`.
- [x] Compare Experiment 010 provider metrics and local base fit. Meshy Repair Printability moved all three GLBs from `error` to `warning` and made them watertight with `0` non-manifold edges, but removed textures. Meshy Remesh exported GLB/STL/3MF and returned texture URLs, but remeshed GLB/STL remained `error`; 3MF is not supported by Meshy Analyze Printability. Local 75mm analysis found all variants fit the `printu-round-v1` foot placement zone.
- [x] Wire the job UI to show a Storage-backed original textured Creative Lab GLB as a color figurine preview when `productType: "figurine"` and `figurinePreview.previewGlb` are present. The UI and checkout callable keep figurine checkout locked while print readiness is `needs_review`.
- [x] Wire the first server-side Creative Lab preview slice into the normal app workflow. Creative Lab Figure jobs now approve the 2D proof, call Meshy from Firebase Functions, ingest the original textured `model.glb` under `print-files/{uid}/{jobId}/figurine/creative-lab-original/`, set `figurinePreview.status: "preview_ready"` and `printReadiness: "needs_review"`, and leave checkout locked. Fixture mode is available for no-credit local verification.
- [x] Approve the official preview pipeline v1 after live browser validation on 2026-06-07. The normal app flow successfully generated and displayed a color Creative Lab Figure GLB preview for job `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`; this confirms the server-side Meshy Creative Lab provider boundary, Storage ingestion, Firestore `figurinePreview` contract, Three.js preview, and checkout lock all work together for preview-only figurine jobs.
- [x] Approve the first Meshy Creative Lab figurine/base scale contract after Blender review of job `f604d393-bfa2-4779-b05b-f6a2082604c9`. The raw Meshy `model.glb` measures `0.786765 x 1.899262 x 0.689108` in GLB units and clean Blender imports it as `0.786765 x 0.689108 x 1.899262`; the matched square base files under `.tmp/gold-standard/Figurine Standard Square Base/` now import at the same raw scale. Target print height is `150mm`, using scale factor `78.978034802`, producing an expected square base of about `105.24mm x 105.24mm x 24.00mm`.

## Next

- [ ] Human-review Experiment 010 in Blender/slicer: original GLB, textureless repaired watertight GLB, textured remeshed GLB/STL/3MF, visible surface quality, support needs, scale, contact area, and whether repaired or remeshed output is sellable.
- [ ] Decide whether the first product path uses Meshy Repair Printability despite texture loss, Meshy Remesh despite topology errors, or a deterministic/local repair/conversion stage after Creative Lab GLB ingestion.
- [ ] Build the deterministic name-on-base service in `services/print-file-generator` after the base STL exists.
- [ ] Build the deterministic Meshy-body-to-named-base assembly service in `services/print-file-generator` after the base naming path is working. It should load raw Creative Lab `model.glb`, load the matched square base, align without modifying the Meshy source asset, then scale the final package to `150mm` figurine height.
- [ ] Inspect Experiment 005 outputs in slicer software: the original `model.3mf`/`model.stl`, normalized outputs, and repaired GLB under `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z/`, then classify whether the body-only Meshy result is promising, weak, or not viable for the first figurine MVP.
- [ ] Inspect Experiment 004 outputs in slicer software: the new paid normalized GLB-source package under `.tmp/experiments/meshy/exp-004-normalize-glb-2026-05-26T00-10-26-648Z/postprocessed/normalized-glb/`, plus the earlier Experiment 002 normalized GLB-source and STL-source smoke packages for source-format comparison.
- [ ] Inspect the downloaded Meshy GLB/STL/3MF in slicer software.
- [ ] Inspect the downloaded Emoji/avatar Meshy GLB/STL/3MF in slicer software.
- [ ] Treat Experiment 003 as a generated-base learning run, not the target saved-base workflow. Inspect it only if useful for body/base placement, scale, and inherited Meshy body defects.
- [ ] Test a repaired STL path separately, because Meshy's `input_task_id` repair path repairs the task GLB and returns GLB only.
- [ ] Inspect Experiment 008 raw Multi-Image-to-3D output in Blender/slicer before using repaired or remeshed variants. Initial thumbnail review shows a body-only Emoji/avatar figure with no provider-generated base.
- [ ] Review the Blender Exp 008 base-fit scene: raw `meshy/model.stl` imported as object `model` at about `951.7 x 742.9 x 1898.8`, while the approved base is `70.0 x 61.5 x 16.0`. A non-destructive scaled duplicate set in collection `Experiment 008 Raw STL Base Fit Review` uses `25.3178x` scale to match the raw STL scene size. Saved copy: `.tmp/experiments/meshy/standard/exp-008-raw-multiview-provider-diagnostics-2026-06-04T23-06-01-301Z/blender/exp008-raw-stl-base-fit-review.blend`.
- [ ] Compare Experiment 008 provider-side diagnostics in slicer: raw Meshy output (`error`: `308` non-manifold edges, `8153` degenerate faces), repaired GLB (`warning`: watertight, `0` non-manifold edges, `8064` degenerate faces), and remeshed GLB/STL/3MF (`error`: `62` non-manifold edges, `80` degenerate faces, `8` holes).
- [ ] Decide how to productize the smoother Meshy frontend Vinyl Figurine output. Blender comparison shows `vinyl-figure-Meshy-Frontend` is visually smoother and more product-like than Exp 008 Multi-Image-to-3D raw/repair/remesh outputs, which show vertical torso/leg banding.
- [ ] Classify Meshy output quality as promising, weak, or not viable for the first figurine MVP.
- [ ] Decide whether Emoji/avatar + Natural pose is good enough to become the first supported style/posture set.
- [ ] Extend the Meshy service slice beyond preview-only GLB ingestion: generation history, retry controls, webhook/poll reconciliation, downstream print-tooling state, and final fulfillment readiness.
- [ ] Update the job page and creation flow for standalone figurine preview, style/posture, 2D proof approval, 3D generation history, and readiness/warning state.
- [ ] Add preorder/lead-capture/checkout gating so the user can proceed only after the active model's fulfillment status is clear.
- [ ] Decide whether the first public validation path is lead capture, paid preorder/manual fulfillment, or checkout.

## Blockers And Risks

- Meshy API output is now technically validated once, but product quality is not accepted yet. The first raw-photo run produced a recognizable bust/torso with truncated arms and no lower body.
- Elliot confirmed the first raw-photo GLB opens in Blender, but it is not the intended style at all. The first proof-driven Emoji/avatar run is visually much closer because it preserves a complete stylized full body.
- The first successful Meshy mesh is not watertight in a basic `trimesh` check, so slicer repair/validation is still required before any fulfillment promise.
- The first Emoji/avatar Meshy output is also not watertight. Meshy's own printability analysis returned `error`, so the path is visually promising but not checkout-ready.
- Experiment 002 produced full local GLB/STL/3MF assets, but Meshy's printability analysis still returned `error`: not watertight, `57` non-manifold edges, `127` degenerate faces, and `0` holes.
- Experiment 002 B proved Meshy Image-to-Image can generate a visually strong round base/nameplate in the multi-view references, but the final 3D thumbnail appears to garble the `Elliott` text. Treat user-custom text as likely needing deterministic geometry or post-processing instead of relying on Meshy to preserve lettering.
- Experiment 002 B printability still returned `error`: not watertight, `70` non-manifold edges, `84` degenerate faces, and `0` holes.
- Experiment 003 used locally generated base/star geometry and did not use the intended saved base STL asset. Keep its run data, but do not treat it as the target product workflow.
- Experiment 003 printability still returned `error` on the original Meshy body: not watertight, `75` non-manifold edges, `79` degenerate faces, and `0` holes. Local postprocessing exported deterministic generated-base/star assets; the generated base and star meshes are watertight, while the combined mesh remains non-watertight because it inherits the Meshy body defects.
- Meshy's print-oriented `model.3mf` outputs for Experiments 002, 002 B, and 003 are already at sensible millimeter scale (`75mm` tall). The oversized Blender STL view is a raw STL unit-scale issue; the Experiment 003 local postprocessed 3MF is genuinely oversized because it used raw STL dimensions without normalizing to Meshy's 3MF or an explicit target height.
- Experiment 004 proves scale/orientation normalization is straightforward, but it also shows GLB-to-STL is not automatically cleaner for print: Meshy's GLB carries many open seam edges after conversion, while the normalized raw STL smoke output had much lower non-manifold edge count. The paid Experiment 004 normalized GLB-source output is correctly sized but still not watertight.
- The paid Experiment 004 thumbnail includes a base because the upstream 2D/reference image path allowed a base and the Meshy runner did not yet reject one. Treat that base as provider-followed input, not the target architecture; future Vertex/Gemini and Meshy body-generation runs now explicitly request no base.
- Experiment 005 fixed the visual base leak: the 2D concept, multi-view references, and Meshy thumbnail are body-only. Printability still returned `error`: not watertight, `103` non-manifold edges, `111` degenerate faces, and `0` holes on Meshy's printability metrics; normalized GLB-source geometry remains not watertight with about `26.8k` non-manifold edges.
- Meshy Repair Printability can repair the Experiment 005 GLB topology enough for Meshy's analyzer to return `warning`: watertight `true`, `0` non-manifold edges, `0` holes, and `111` remaining degenerate faces. Slicer validation is still required, and repaired output is textureless GLB when repaired by `input_task_id`.
- Meshy Remesh quad/100k is not a print-readiness replacement for Repair Printability on Experiment 005. It reduced non-manifold edges to `4` and degenerate faces to `75`, but remained not watertight and introduced `1` hole, so Meshy's analyzer still returned `error`.
- Experiment 008 confirms the body-only Multi-Image-to-3D path can avoid provider-generated bases when upstream prompts are strict and generation-time remesh is disabled. Raw printability still returned `error`; Meshy Repair Printability improved topology to `warning` but produced a textureless GLB, while Remesh preserved texture/color but remained `error`.
- Experiment 008 raw `model.stl` imports around `1898.8` scene units tall, consistent with Meshy's raw STL scale pattern. Treat this as provider-scale inspection evidence, not product-ready scale; use `model.3mf` or explicit target height for manufacturing normalization.
- Meshy's frontend Vinyl Figurine output is currently the strongest visual/product candidate in Blender. Multi-Image-to-3D raw/repair/remesh outputs still show visible vertical banding on smooth shirt/leg surfaces, so topology repair alone does not solve the vinyl-toy surface-quality issue.
- Experiment 009 Creative Lab Figure thumbnails are visually smooth and do not show an obvious generated pedestal from the preview angle, but all three raw GLBs still fail Meshy's printability analysis. The API returned GLB/OBJ plus texture; MTL download returned `403` in all three passes, matching prior Creative Lab behavior.
- Experiment 009 GLB imports in Blender confirm the no-base signal: `Mesh_0.003`, `Mesh_0.004`, and `Mesh_0.005` are smooth standalone figures with feet/shoes-sized bottom footprints. Creative Lab did not return STL/3MF, so GLB is the usable review asset unless we convert downstream.
- Approved workflow milestone as of 2026-06-05: Creative Lab Figure API GLB generation is the current best upstream figure-generation step because it produced smooth no-base figures in Experiment 009. Do not regress to Multi-Image-to-3D for the first product path unless Creative Lab print conversion fails or API/business constraints block it.
- Experiment 010 should not spend credits on new 3D generation. It should continue from the three downloaded Experiment 009 GLBs and test Meshy print tooling and/or conversion into printable outputs.
- Official preview pipeline v1 as of 2026-06-07: upload photo -> Creative Lab Figure style -> Vertex/Gemini 2D figurine proof -> approve proof -> Firebase Functions calls Meshy Creative Lab Figure -> original textured `model.glb` is stored under the job-owned `print-files/.../figurine/creative-lab-original/` path -> job page renders the color figurine preview with `printReadiness: "needs_review"` -> checkout remains locked.
- The approved saved base STL now exists, but deterministic name geometry and body/base assembly services are not implemented yet.
- Slicer and physical-print validation are still required before promising automated fulfillment.
- Cloudflare token access remains partial: Worker deploy and domain listing work, but DNS record and Worker route reads return `403`.
- Likeness, celebrity/IP, minors/consent, and moderation rules need explicit product decisions before public traffic.
- Meshy assets may expire quickly; production code must copy accepted artifacts into project storage promptly.

## Human Validation

- [human-tasks/open/2026-05-23-evaluate-meshy-figurine-flow.md](human-tasks/open/2026-05-23-evaluate-meshy-figurine-flow.md)

## References

- [docs/MESHY_FIGURINE_UI_WORKFLOW.md](docs/MESHY_FIGURINE_UI_WORKFLOW.md)
- [research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md](research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md)
- [research/FIGURINE_PROVIDER_RESEARCH.md](research/FIGURINE_PROVIDER_RESEARCH.md)
- [infra/cloudflare/meshy-webhook-receiver/README.md](infra/cloudflare/meshy-webhook-receiver/README.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [CHANGELOG.md](CHANGELOG.md)
