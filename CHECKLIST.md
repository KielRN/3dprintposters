# Active Checklist

Last updated: 2026-05-24

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

## Next

- [ ] Inspect the downloaded Meshy GLB/STL/3MF in slicer software.
- [ ] Generate or select an Emoji/avatar Natural pose 2D concept proof as the next Meshy input.
- [ ] Run the next Meshy job from that Emoji/avatar Natural pose input and compare it with the raw-photo run.
- [ ] Classify Meshy output quality as promising, weak, or not viable for the first figurine MVP.
- [ ] Decide whether Emoji/avatar + Natural pose is good enough to become the first supported style/posture set.
- [ ] Implement the Meshy service slice from `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`: provider adapter, task tracking, asset ingestion, readiness, and idempotency.
- [ ] Update the job page and creation flow for standalone figurine preview, style/posture, 2D proof approval, 3D generation history, and readiness/warning state.
- [ ] Add preorder/lead-capture/checkout gating so the user can proceed only after the active model's fulfillment status is clear.
- [ ] Decide whether the first public validation path is lead capture, paid preorder/manual fulfillment, or checkout.

## Blockers And Risks

- Meshy API output is now technically validated once, but product quality is not accepted yet. The first raw-photo run produced a recognizable bust/torso with truncated arms and no lower body.
- Elliot confirmed the first GLB opens in Blender, but it is not the intended style at all. Future evaluation should focus on Emoji/avatar + Natural pose proof-driven runs.
- The first successful Meshy mesh is not watertight in a basic `trimesh` check, so slicer repair/validation is still required before any fulfillment promise.
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
