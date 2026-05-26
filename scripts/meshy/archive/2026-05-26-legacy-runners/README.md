# Legacy Meshy Experiment Runners

Archived: 2026-05-26

These scripts are preserved only to reproduce historical Meshy runs from Experiments 001 through 004.

Active experiments should use:

```powershell
npm run meshy:experiment -- -- --experiment-slug exp-00N-short-name
```

Active runner:

- `scripts/meshy/run-standard-figurine-experiment.mjs`

Archived scripts:

- `create-image-to-3d-job.mjs`: direct source-image-to-Meshy job runner used by the first raw-photo API test.
- `run-emoji-natural-experiment.mjs`: Experiment 001 single Vertex/Gemini concept -> Meshy Image-to-3D runner.
- `run-emoji-natural-multiview-experiment.mjs`: Experiment 002 through 004 multi-view runner with optional base, deterministic base, and normalization flags.

Do not add new experiment behavior here. Build future experiment increments in the standard runner so runs remain comparable.
