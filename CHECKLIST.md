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
5. App stores generated GLB/STL/3MF artifacts.
6. Job page shows an honest 3D preview and readiness/warning state.
7. Product chooses lead capture, preorder/manual fulfillment, or checkout based on real output quality.

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

## Next

- [ ] Generate at least one successful Meshy figurine output from a customer-like image.
- [ ] Download and inspect the generated GLB/STL/3MF in slicer software.
- [ ] Classify Meshy output quality as promising, weak, or not viable for the first figurine MVP.
- [ ] Decide first supported style/posture set from actual outputs, not provider marketing.
- [ ] Create the figurine workflow service contract from `docs/MESHY_FIGURINE_UI_WORKFLOW.md`: source upload validation, style/posture metadata, 2D concept history, selected concept, 3D model history, readiness state, base/sign config, and checkout eligibility.
- [ ] Implement the Functions-side figurine orchestration service: create/validate figurine jobs, generate 2D concepts, approve/select a concept, submit 3D model generation, and expose job/model status to the web app.
- [ ] Implement a server-side generated-3D provider boundary with Meshy as the first provider after output quality is accepted for customer-facing use. Scaffolding can land earlier, but public checkout must stay gated.
- [ ] Persist Meshy task audit metadata without secrets: provider id, task id, model/version, status, requested formats, warnings, credits/cost, webhook state, polling state, and source artifact paths.
- [ ] Implement the Meshy asset-ingestion service: download accepted GLB/STL/3MF/thumbnails into user/job-scoped Firebase Storage before Meshy retention expires.
- [ ] Connect Meshy polling and/or webhook events to Firestore job state, model history, warnings, and readiness status.
- [ ] Create a figurine artifact/readiness service that reports preview-ready, needs-review, printability-warning, print-ready, or blocked states.
- [ ] Update the job page to review standalone figurine GLB assets instead of only poster-relief GLB/heightmap artifacts.
- [ ] Add customer-facing figurine controls: style, posture, 2D proof review/history, 3D generation state/history, color mode, base, and sign text.
- [ ] Add preorder/lead-capture/checkout gating so the user can proceed only after the active model's fulfillment status is clear.
- [ ] Decide whether the first public validation path is lead capture, paid preorder/manual fulfillment, or checkout.

## Blockers And Risks

- Meshy output quality is still unvalidated because the first API delivery test failed before model generation.
- Slicer and physical-print validation are still required before promising automated fulfillment.
- Cloudflare token access remains partial: Worker deploy and domain listing work, but DNS record and Worker route reads return `403`.
- Likeness, celebrity/IP, minors/consent, and moderation rules need explicit product decisions before public traffic.
- Meshy assets may expire quickly; production code must copy accepted artifacts into project storage promptly.

## Human Validation

- [human-tasks/open/2026-05-23-evaluate-meshy-figurine-flow.md](human-tasks/open/2026-05-23-evaluate-meshy-figurine-flow.md)

## References

- [docs/MESHY_FIGURINE_UI_WORKFLOW.md](docs/MESHY_FIGURINE_UI_WORKFLOW.md)
- [research/FIGURINE_PROVIDER_RESEARCH.md](research/FIGURINE_PROVIDER_RESEARCH.md)
- [infra/cloudflare/meshy-webhook-receiver/README.md](infra/cloudflare/meshy-webhook-receiver/README.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [CHANGELOG.md](CHANGELOG.md)
