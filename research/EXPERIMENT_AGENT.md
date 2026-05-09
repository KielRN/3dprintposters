# Experiment Agent Guide

This guide defines the repo-local EXPERIMENT agent role for 3D Print Posters. Use it when adding or evaluating heightmap, depth, bas-relief, masking, or image-to-3D experiments.

The goal is not to make experiments bigger. The goal is to make them repeatable, isolated, and honest enough that we can tell whether an idea improves the 5x7 printable relief product.

## Mission

The EXPERIMENT agent wires experimental providers correctly for the project purpose:

- Preserve the production-safe checkout path.
- Keep geometry generation, texture packaging, and print-file creation server-side.
- Add experiments as opt-in providers or sidecar scripts inside `services/print-file-generator`.
- Produce comparable local artifacts for both canonical source images.
- Record whether an experiment is merely wired, visibly better, printable, or a production candidate.

## Non-Goals

The EXPERIMENT agent does not:

- Replace `posterized_luminance` as the default provider without explicit user approval.
- Move print-file generation into the browser.
- Add production dependencies casually.
- Commit secrets, API keys, model tokens, or generated binary artifacts.
- Create, switch, or rename Git branches unless the user explicitly asks.
- Treat a successful run as proof of quality.

## Credentials And Secrets

The EXPERIMENT agent may need model-provider credentials for some experiments, but it must never print, copy, commit, or document secret values.

Use only secret names and approved local lookup locations:

- Root `.env`: may contain Hugging Face credentials for local experiments.
- `apps/functions/.env`: local Firebase Functions values, including Vertex/Gemini configuration for function-only emulator runs.
- `apps/web/.env.local`: local web app public Firebase/emulator flags only. Do not put server secrets here.
- Firebase Functions secrets or Google Secret Manager: deployed runtime secrets.

Common environment variable names to check by name only:

- `HF_TOKEN`
- `HUGGING_FACE_HUB_TOKEN`
- `VERTEX_API_KEY`
- `AI_PROVIDER_ROUTE`
- `APP_STORAGE_BUCKET`
- `PRINT_FILE_GENERATOR_URL`

Credential rules:

- Do not paste secret values into chat, docs, metadata, logs, or generated experiment reports.
- Do not move secrets between `.env` files unless the user explicitly asks and the destination is appropriate.
- Do not add new tracked files that contain secrets or secret-like placeholders with real values.
- If a provider can run from a public model without a token, prefer that path for local experiments.
- If a required credential is missing, report the missing variable name and the expected local file or secret store, but not any nearby values.
- If a command might echo environment values, avoid it or redact the output before reporting.

## Experiment Contract

Every experiment should define:

- Experiment number, provider name, and short hypothesis.
- Baseline provider to compare against.
- Expected output folder.
- Required inputs.
- Pass, fail, and inconclusive criteria.
- Known limitations and follow-up questions.

Use names that are precise and stable. Prefer provider names like `depth_anything_v2_small_bas_relief` over vague names like `new_depth_test`.

## Required Inputs

Run every heightmap experiment against both canonical local inputs:

```powershell
.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png
.tmp\input_image\Profile-Pic-HIMSS.jpg
```

If either input is missing, report that clearly and do not pretend the experiment is complete.

## Output Layout

Experiment outputs must stay under ignored local paths:

```text
.tmp/experiments/experiment_N/{provider}/{jobId}/
```

Each successful run should produce:

- `model.stl`
- `preview.glb`
- `heightmap.png`
- `metadata.json`
- `filament-painting/preview.png`

Do not commit generated experiment outputs unless the user explicitly asks for an artifact snapshot.

## Wiring Checklist

When adding a print-file-generator provider:

- Add the provider name to `HeightmapProviderName` in `services/print-file-generator/app/depth.py`.
- Implement a provider class with a stable `name` matching the provider string.
- Register the provider in `get_depth_provider()`.
- Add the provider name to `ReliefSettings.height_provider` in `services/print-file-generator/app/models.py`.
- Wire the provider into `services/print-file-generator/scripts/run_heightmap_experiment.py`.
- Make sure default behavior remains `posterized_luminance`.
- Keep the provider opt-in through request settings or the local experiment runner.

## Runner Rules

The local runner should:

- Default to experiment 1 providers only when no provider is specified.
- Route each provider to the correct experiment folder.
- Support explicit `--output-root` for manual comparisons.
- Avoid mixing providers from different experiments into the wrong output folder.
- Print the provider, status, and output prefix for every run.

For mixed-provider runs, prefer per-provider routing rather than one shared inferred output root.

## Verification

Minimum verification for a new experiment:

```powershell
cd services/print-file-generator
python -m pytest tests
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg --provider <provider>
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png --provider <provider>
```

Also inspect the generated `metadata.json` files and confirm:

- `height_provider` matches the new provider.
- `watertight` is `true`.
- `width_mm` is `127.0`.
- `height_mm` is `177.8`.
- `triangle_count` stays inside the printability budget.
- `min_height_mm` and `max_height_mm` are within the expected relief range.

## Tests

Add focused tests when an experiment introduces new logic.

At minimum, test one of:

- Provider registration returns the expected provider.
- The provider calls the intended inference or transform function.
- The transform changes the input in the expected direction.
- Output heights stay within `base_thickness_mm + min_relief_mm` and `base_thickness_mm + max_relief_mm`.

Tests should use small arrays and monkeypatched inference. Do not require model downloads for normal test runs.

## Quality Assessment

Separate these claims:

- `wired`: Provider is registered, runs, and writes artifacts.
- `printable`: Artifacts pass printability checks.
- `visibly improved`: Heightmap or preview looks better than baseline for the product goal.
- `production candidate`: Quality, cost, licensing, runtime, failure modes, and maintainability are acceptable.

Do not collapse these into one success state. A provider can be wired and printable while still not being good enough.

## Numeric Comparison

When comparing against a prior experiment, record practical metrics:

- Heightmap min, max, mean, and standard deviation.
- Mean and 95th percentile absolute difference from baseline heightmap.
- Triangle count and binary STL size.
- Any printability warnings.

Numeric differences do not prove quality, but they catch accidental no-op wiring.

## Visual Review

For each canonical input, compare:

- Source image.
- Baseline heightmap.
- Experiment heightmap.
- Baseline `preview.glb`.
- Experiment `preview.glb`.

Look specifically for portrait readability, harsh slopes, muddy facial features, blocky bands, blown-out depth, and lost subject-background separation.

## Documentation Updates

When behavior changes meaningfully, update the relevant docs:

- `research/HEIGHTMAP_AND_3D_WORKFLOW_RESEARCH.md`
- `AI_DEVELOPER_NOTES.md`
- `CHANGELOG.md`
- `services/print-file-generator/README.md`
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`

Short-lived local result notes may live under `.tmp/experiments/experiment_N`, but durable conclusions belong in tracked documentation.

## Result Template

Use this shape when reporting an experiment:

```text
Experiment: <number and name>
Provider: <provider>
Hypothesis: <one sentence>
Baseline: <provider or experiment>
Inputs: <both canonical inputs or explain missing input>
Artifacts: <output folder>
Verification: <tests and commands run>
Status: wired | printable | visibly improved | production candidate | failed | inconclusive
Findings: <short bullets>
Risks: <short bullets>
Next step: <one concrete next action>
```

## Current Experiment Map

- Experiment 1: deterministic comparison providers: `posterized_luminance`, `continuous_luminance`, `lithophane_baseline`.
- Experiment 2: semantic depth provider: `depth_anything_v2_small`.
- Experiment 3: bas-relief transform provider: `depth_anything_v2_small_bas_relief`.

Keep future experiments isolated by provider/config first. Only introduce a separate branch or larger dependency stack when the experiment cannot stay cleanly contained.
