# Test Creative Lab Figurine Preview Flow

Status: done
Owner: Human
Created: 2026-06-07
Source: `apps/functions/src/index.ts`, `apps/functions/src/meshyFigurineProvider.ts`, `apps/web/components/UploadFlow.tsx`, `elliot_quick_dev_Startup.md`

## Why Human

This needed Elliot's local browser session, Firebase/Meshy runtime credentials, and visual judgment of the generated 3D preview. Elliot validated the live browser workflow on 2026-06-07.

## Steps

1. Start the local print-file generator, Functions emulator, and web app using `elliot_quick_dev_Startup.md` or the commands in `AGENTS.md`.
2. Confirm `apps/functions/.env` has the required server-only values for live mode: `APP_STORAGE_BUCKET`, `AI_PROVIDER_ROUTE=vertex-gemini-direct`, `VERTEX_API_KEY`, and `MESHY_API_KEY`. Do not paste or commit any secret values.
3. In the browser, create a new job with style `Creative Lab Figure`, upload a JPG or PNG source photo, and wait for the generated 2D figurine proof.
4. Approve the proof and let the Functions workflow call Meshy Creative Lab Figure.
5. On `/jobs/{jobId}`, confirm the color figurine GLB renders, the status is preview-only / needs review, and checkout remains disabled.
6. If the run fails, capture the Functions emulator error stage and the job document fields that are safe to share.

## Done When

- The job document has `productType: "figurine"`.
- `figurinePreview.previewGlb` points to `print-files/{uid}/{jobId}/figurine/creative-lab-original/model.glb`.
- `figurinePreview.status` is `preview_ready`.
- `figurinePreview.printReadiness` is `needs_review`.
- Checkout is still disabled or rejected for the figurine job.

## Evidence To Capture

- Job ID and safe Storage path only, not signed URLs or secrets.
- Screenshot or notes from the job page showing the rendered color figurine preview and locked checkout state.
- Meshy prototype/build task IDs if visible in safe logs or Firestore metadata.

## Result

- Validated on 2026-06-07.
- Job ID: `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`.
- The job page rendered the Storage-backed color Creative Lab GLB preview.
- Status showed `Color preview ready`.
- Model showed `preview ready`.
- Print readiness showed `needs review`.
- The visible UI retained preview-only warning copy and did not unlock checkout.

## Related Files

- `AGENTS.md`
- `elliot_quick_dev_Startup.md`
- `apps/functions/src/index.ts`
- `apps/functions/src/meshyFigurineProvider.ts`
- `apps/web/components/JobDetail.tsx`
- `apps/web/components/UploadFlow.tsx`
