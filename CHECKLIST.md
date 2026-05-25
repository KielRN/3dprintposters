# Active Checklist

Last updated: 2026-05-25

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

## Next

- [ ] At the start of the next chat, run Experiment 003 with `npm run meshy:exp-003-deterministic-base`. This creates paid Meshy tasks, then runs local deterministic post-processing.
- [ ] Inspect the downloaded Meshy GLB/STL/3MF in slicer software.
- [ ] Inspect the downloaded Emoji/avatar Meshy GLB/STL/3MF in slicer software.
- [ ] Inspect the Experiment 003 postprocessed STL/GLB/3MF in slicer software. Specifically check whether the deterministic base is printable, whether the star is preserved, and whether the model stands/supports cleanly.
- [ ] Run Meshy Repair Printability or slicer repair on the Emoji/avatar output and compare the repaired result with the original.
- [ ] Classify Meshy output quality as promising, weak, or not viable for the first figurine MVP.
- [ ] Decide whether Emoji/avatar + Natural pose is good enough to become the first supported style/posture set.
- [ ] Implement the Meshy service slice from `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`: provider adapter, task tracking, asset ingestion, readiness, and idempotency.
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
- Experiment 003 should separate provider generation from product base control: Meshy creates the body, then local deterministic geometry adds the round base and center star. The setup smoke test exported local STL/GLB/3MF files from an existing Meshy STL, and the base-only mesh was watertight.
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
