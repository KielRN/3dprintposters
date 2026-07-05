---
name: seed-dev-paid-order
description: Use when a 3DPrintPosters dev/test job must appear in the Print Console by seeding it as paid. This skill reads the current Firestore job, mirrors the Stripe webhook paid-order shape into orders/{jobId}, sets jobs/{jobId}.pipelineStage to paid, and verifies the console-facing fields. Trigger on requests like "seed this job as paid", "make this job show in Print Console", or "put this dev job in the Available tab".
---

# Seed Dev Paid Order

## Overview

Use this skill only for dev/test payment seeding. It does not call Stripe, does not prove a real payment, and should not be used as a production payment repair tool.

## Workflow

1. From the repo root, run Graphify or targeted source reads if the Print Console inclusion rule may have changed. Current rule: `listOperatorJobs` queries `jobs` by `pipelineStage`; the Available tab is `paid`.
2. Inspect the current job/order state before writing when useful:

```powershell
npm run dev:seed-paid-order -- <jobId> -- --dry-run
```

3. Seed the dev job:

```powershell
npm run dev:seed-paid-order -- <jobId>
```

The script reads `jobs/{jobId}`, creates or updates `orders/{jobId}`, and writes:

- `jobs/{jobId}.pipelineStage = "paid"`
- `orders/{jobId}.status = "paid"`
- `orders/{jobId}.paymentStatus = "paid"`
- `orders/{jobId}.fulfillment.stage = "paid"`
- `orders/{jobId}.fulfillment.history[]` entry with `by = "dev_seed_paid_order"`

It also copies job print fields into the order snapshot where available, matching the real checkout/order shape closely enough for Print Console testing.

## Guardrails

- If `FIRESTORE_EMULATOR_HOST` is set, the script targets the emulator. Otherwise it targets the configured dev Firebase project, defaulting to `gen-lang-client-0675309660`.
- The script fails if `jobs/{jobId}` does not exist.
- The script refuses to move an existing advanced fulfillment stage such as `accepted`, `in_production`, or `shipped` back to `paid` unless `--reset-stage` is passed.
- Do not paste or print credential contents. Rely on local ADC/service-account configuration already available to Firebase Admin.

## Troubleshooting

- If the job still does not show in Print Console, refresh the web app and check the operator tab. `paid` jobs show under Available; later stages show under Mine or Done.
- Verify the script output reports `jobPipelineStage: "paid"` and `orderFulfillmentStage: "paid"`.
- If the wrong Firebase target is used, check `FIRESTORE_EMULATOR_HOST`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, and `.firebaserc` without printing secret values.
