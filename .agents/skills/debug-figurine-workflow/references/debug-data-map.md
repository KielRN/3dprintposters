# Debug Data Map

Use this reference when the failure boundary is unclear.

## Job Fields To Inspect

- `generationState`: customer-visible progress/failure state.
- `aiGeneration`: Vertex/Gemini provider status, route, model, proof mode, and failure.
- `generatedOptions`: proof image options for generated-options workflows.
- `figurineConcept`: Creative Lab concept/prototype state when the customer reviews a Meshy concept.
- `figurineGeneration`: generated-3D provider status, workflow, provider, provider model, task ids, credits, and output paths.
- `figurinePreview`: customer/operator preview artifacts and print readiness.
- `figurineBuild`: paid-build queue/running/done state.
- `pipelineStage`: checkout/operator state.
- `orders/{jobId}`: paid/order/fulfillment state.

## Fast Boundary Clues

- Source upload exists but no `aiGeneration.startedAt`: callable/auth/config boundary.
- `aiGeneration.status = succeeded` and generated preview path exists, but provider state failed: Meshy/Hi3D boundary.
- `prototypeTaskId` exists and no `buildTaskId`: Creative Lab prototype/concept stage.
- Direct workflow has provider task/model fields but no preview artifact: direct Multi-Image-to-3D boundary.
- GLB exists but `printReadiness = needs_review`: operator/print-readiness boundary, not proof generation.
