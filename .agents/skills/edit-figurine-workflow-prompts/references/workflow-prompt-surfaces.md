# Workflow Prompt Surfaces

Use this reference only when the prompt edit is non-trivial or the code moved.

## Core Files

- `apps/functions/src/aiProvider.ts`: Vertex/Gemini request construction, template face-swap execution, generated-options proof prompt construction, and model endpoint logic.
- `apps/functions/src/figurineWorkflowConfig.ts`: backend workflow config schema, default styles, prompt constants, provider catalog, validation, and public config stripping.
- `apps/web/lib/figurineWorkflowConfig.ts`: browser mirror used by Storyfront and Admin Workflow Controls.
- `apps/web/components/AdminWorkflowConfig.tsx`: admin preset selector, prompt textarea, reference image upload, public visibility, and direct-provider selectors.
- `apps/functions/test/figurineWorkflowConfig.test.mjs`: default style, prompt preset, public-config, provider, and validation regression tests.

## Prompt Modes

- `generated_options`: base proof prompt plus selected style prompt feed `buildFigurineProofPrompt`.
- `template_face_swap`: selected style prompt is the whole Vertex instruction. It is sent verbatim through `resolveTemplateFaceSwapPrompt`.
- `realistic_person`: generated-options rendering branch for internal person cleanup before Creative Lab stylization.

## Verification Bias

Prefer reusable preset plus admin selector when a prompt can apply to future styles. Prefer one-style default edits only when the user explicitly asks for a style-specific patch.
