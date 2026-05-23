# Review of `HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md`

Date: 2026-05-09
Reviewer: second-pass review against on-disk artifacts
Source under review: [HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md](HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md)

2026-05-23 status update: this review remains valid for poster relief, but the active product priority is now a PrintU-like standalone figurine flow. Full image-to-3D remains rejected for poster relief, not for figurines.

## Summary

I agree with the strategic direction in the final evaluation:

- Reject full image-to-3D (TripoSR/Tripo class) for the bas-relief poster product.
- Treat Experiment 4 (`segformer_masked_depth`, originally `sam_masked_depth`) as the foundation for the next prototype, not as a checkout default.
- Build a hybrid provider that combines semantic depth, subject masking, controlled detail recovery, and a real bas-relief compression stage.
- Treat Experiment 3's current bas-relief transform as scaffolding, not a quality claim.

I also agree with the doc's framing that the five-experiment cycle is complete. The changes below are intended to be folded into the build of the hybrid provider, not run as standalone Experiment 6/7 cycles. The next deliverable should be a working `masked_depth_detail_blend` prototype, with these decisions made along the way.

## Verified Against Artifacts

I cross-checked the doc against:

- `.tmp/experiments/experiment_4/sam_masked_depth/Profile-Pic-HIMSS/metadata.json` (artifact path retains the original provider name)
- `.tmp/experiments/experiment_5/triposr_sidecar/Profile-Pic-HIMSS/metadata.json`
- `.tmp/experiments/experiment_4/Profile-Pic-HIMSS_comparison.png`
- `.tmp/experiments/final_eval_contact_sheets/Profile-Pic-HIMSS_all_providers.png`
- `.tmp/experiments/experiment_4/README.md`
- `.tmp/experiments/experiment_5/README.md`

Findings the document gets right:

- All providers produce the same printability envelope (1.6 mm to 4.2 mm, 223,996 triangles, watertight).
- Depth-based providers (Experiments 2, 3, 4) render portraits as smooth head/shoulders reliefs with little facial identity. Visible in the contact sheet.
- `lithophane_baseline` preserves visibly more eye/smile/face structure than the other deterministic providers.
- TripoSR produced a side-profile silhouette from a front-facing input. That is a categorical mismatch, not a tuning problem.
- Experiment 3's mean abs diff of 146 (16-bit) vs Experiment 2 is effectively a no-op.

## Production Architecture Context

The recommendations below assume the production architecture stated by the user 2026-05-09: AI inference runs via API providers on Firebase / Google Cloud. Local model inference is dev/experiment territory, not the production path. Offline operation is not a goal.

**Prior art already in the repo (extend, don't reinvent):**

- [apps/functions/src/aiProvider.ts](apps/functions/src/aiProvider.ts) defines a `PosterAiProvider` interface with two implementations (`vertex-gemini-direct`, `cloudflare-ai-gateway`) selected by the `AI_PROVIDER_ROUTE` env var. New AI roles should follow this pattern: typed interface, factory, env-driven route, multiple backends.
- The Cloudflare AI Gateway implementation is stubbed but [reserved for "later provider comparison, rate limiting, observability, and fallback"](apps/functions/src/aiProvider.ts:178). Multi-provider routing should go through the gateway where applicable, not through a parallel system.
- Firebase Storage holds job-scoped artifacts at `generated/{uid}/{jobId}/...`. Cache for AI responses lands in the same bucket under a `cache/` prefix.
- Firestore holds job state, rules, indexes. Natural home for the per-role provider registry (priority list, retry policy, cost ceilings) and per-job provider audit trail.
- [services/print-file-generator/](services/print-file-generator/) is a Python service with `Dockerfile` + uvicorn — Cloud Run shape. Heavy compute (mesh, heightmap) runs here; Functions orchestrates and calls it. AI calls from this service should use service-account auth where the provider supports it; env-var API keys are dev-time fallback only.

**AI roles needed by the heightmap product:**

| Role | Status | Existing implementation | Production candidate providers |
|---|---|---|---|
| Poster proof image generation | Wired | `PosterAiProvider` (Vertex/Gemini direct; Cloudflare gateway stub) | Vertex AI / Gemini, Cloudflare-gatewayed |
| Monocular depth estimation | Scaffolded as `MonocularDepthChain` ([app/providers/monocular_depth.py](services/print-file-generator/app/providers/monocular_depth.py)). Default chain: `LocalDepthAnythingV2Provider` (dev-only). Stubs for `HfInferenceDepthAnythingProvider` and `VertexDepthProvider`. | Vertex AI (if it serves depth), HF Inference (Depth Anything V2 hosted), Cloudflare-gatewayed any of the above |
| Subject segmentation | Scaffolded as `SubjectSegmentationChain` ([app/providers/segmentation.py](services/print-file-generator/app/providers/segmentation.py)). Default chain: `HfInferenceSegmentationProvider` (SegFormer/ADE20K). Stubs for `VertexSegmentationProvider` and `CloudflareGatewaySegmentationProvider`. | Vertex AI Vision segmentation, HF Inference (SegFormer current), Cloudflare-gatewayed any of the above |
| Image-to-3D | Rejected for poster product | `_infer_triposr_api` to Tripo AI | Not pursuing |

**Provider registry shape (proposed):**

For each role, a typed config object:

```text
{
  role: "subject_segmentation",
  primary: "vertex-vision-segmentation",
  fallback_chain: ["hf-inference-segformer", "cloudflare-gateway-segmentation"],
  retry_policy: { attempts: 2, backoff_ms: 500 },
  per_provider_config: {
    "vertex-vision-segmentation": { ... },
    "hf-inference-segformer": { model: "nvidia/segformer-b0-finetuned-ade-512-512" },
  },
  budgets: { p95_latency_ms: 30000, max_cost_usd_per_call: 0.05 },
  approved_for_default: true
}
```

Stored in Firestore (or a typed config under `infra/firebase/`). Per-job execution writes the actual provider used to the job document for audit. Cloudflare AI Gateway sits in front of providers it can serve so observability/rate-limit/cost data flows through one pane.

**Identity and auth:**

- Vertex / GCP-native services: service-account ADC (Application Default Credentials) on Cloud Run, no API key needed.
- Hugging Face Inference: API key in Secret Manager, mounted at runtime; dev fallback to `.env`.
- Cloudflare AI Gateway: gateway-managed credentials.

**Cost and latency observability:**

- Cloud Logging / Cloud Monitoring captures per-provider latency and cost from production traffic. Quality-gate cost/latency thresholds in item 3 should be enforced both in CI (synthetic) and against rolling p50/p95 from production.

## Recommended Changes to the Final Evaluation

### 1. Resolve the fallback question while building the hybrid

The document keeps `posterized_luminance` as the deterministic checkout fallback and treats `lithophane_baseline` only as a future detail-reference layer.

The contact sheet shows `lithophane_baseline` preserving more facial identity than `posterized_luminance` while being equally deterministic and equally printable. The stated reason for not promoting it ("preserves too much background texture") is not quantified anywhere.

This does not need a standalone experiment. The hybrid prototype already needs a deterministic detail source, so the choice gets made implicitly during that build.

Recommended action:

- While building `masked_depth_detail_blend`, render both `posterized_luminance` and `lithophane_baseline` on the canonical inputs and put them in the same comparison sheet as the hybrid candidate.
- Pick the better one as the in-mask detail source for the hybrid.
- That same choice becomes the deterministic fallback. If `lithophane_baseline` wins inside the mask, it also wins as the fallback default; demote `posterized_luminance` to secondary.
- If `lithophane_baseline` is rejected because of background texture, capture the specific failure mode (which inputs, which artifacts) in the prototype's notes.

### 2. Soften the executive ranking

The current text says Experiment 4 is "the strongest overall path." That overstates what the contact sheet shows.

Experiment 4 is the strongest *base* for the hybrid pipeline because it solves subject/background separation. It is not, on its own, the strongest portrait provider today. `lithophane_baseline` produces a more recognizable face today.

Recommended phrasing change:

- "Experiment 4 is the best foundation for the next hybrid provider. It is not, in isolation, the best portrait provider today; `lithophane_baseline` currently preserves more facial identity. The hybrid pipeline is what unlocks Experiment 4's value."

### 3. Define the quality gates with concrete metrics

The doc lists subjective gates (subject/background separation, portrait identity readability, background flatness, no hard mask ridge, no high-frequency printable noise, acceptable latency/cost/license). Without measurable definitions, "visibly improved" remains subjective.

Decision (2026-05-09): adopt the concrete metrics below. Landed as [services/print-file-generator/app/quality_gates.py](services/print-file-generator/app/quality_gates.py) plus [tests/test_quality_gates.py](services/print-file-generator/tests/test_quality_gates.py). Reports emit to `.tmp/quality_gates/{provider}__{job_id}.json`; calibration view via `scripts/run_quality_gates.py`.

Thresholds calibrated 2026-05-09 against the existing five experiments on the two canonical inputs, then **recalibrated 2026-05-09** after the bas-relief transform swap (item 5) replaced no-op artifacts with actual compressed reliefs.

> **Methodological note.** The first calibration produced a `subject/background separation ≥ 1.4 mm` threshold for portraits, derived from the artifacts on disk. Those artifacts had been generated by the previous gradient-attenuation transform, which was structurally a no-op — so the "subject/background separation" the threshold was measuring was the gap in *uncompressed* depth, not in compressed relief. Once the guided-filter transform actually compressed the global range as bas-relief is supposed to, the artifacts changed shape and the threshold became wrong. The lesson: calibrate gates against artifacts produced by the same code path production will run, never against a stale snapshot. Background flatness, which was advisory under the first calibration, became the cleanest discriminator under the second.

| Gate | Metric | Recalibrated threshold |
|---|---|---|
| **Background flatness (primary discriminator)** | `std(heightmap[~subject_mask])` in mm | **≤ 0.25 mm** — passes only providers that actually compress global range. Old advisory ≤ 0.85 mm rejected nothing meaningful. |
| Subject/background separation (portrait) | `mean(heightmap[subject_mask]) − mean(heightmap[~subject_mask])` in mm | ≥ 0.3 mm — catches "no separation at all"; weak discriminator now that compressed reliefs sit at ~0.4 mm and uncompressed at ~1.4 mm. |
| Subject/background separation (non-portrait) | same | ≥ 0.2 mm |
| Portrait face detected | OpenCV Haar frontal-face detection on grayscale render of heightmap | required on portrait inputs (rejects TripoSR) |
| Hard mask ridge | Max heightmap gradient (mm/pixel) within 5-pixel band of subject mask edge | ≤ 0.6 mm/pixel |
| High-frequency printable noise | Ratio of high-pass energy (above 1/3 Nyquist) to total energy | ≤ 0.03 |
| Composition preservation | `composition_gradient_correlation`: Pearson correlation between source-image gradient magnitude and heightmap gradient magnitude after coarse resizing. This replaces SSIM-on-brightness, which was structurally broken for relief because dark image regions can correctly map to high relief. | calibration metric landed; strict threshold TBD |
| Latency | Per-image wall-clock, p50 and p95. CI: synthetic measurement on canonical inputs. Production: rolling p50/p95 from Cloud Logging per provider. | p95 ≤ 30s |
| Cost | Per-image cost per provider, from billing or provider self-report, surfaced into the registry config | Default-eligible providers: ≤ $0.10/image |
| License / ToS | API ToS permits commercial use of outputs AND provider is on the GCP org approved-vendors list | Both required for default-eligible providers |

What the recalibrated gates say about the current artifacts (post-guided-filter rerun of experiments 3 and 4):

| Provider | Portrait verdict | Non-portrait verdict |
|---|---|---|
| `posterized_luminance` | fails bg flatness (0.84) | fails bg flatness (0.64) |
| `continuous_luminance` | fails bg flatness (0.84) | fails bg flatness (0.63) |
| `lithophane_baseline` | fails bg flatness (0.83) and mask ridge (0.95) | fails bg flatness (0.56) and mask ridge (0.69) |
| `depth_anything_v2_small` (no compression) | fails bg flatness (0.65) and mask ridge (0.89) — correctly flagged as raw depth, not relief | fails bg flatness (0.79) and mask ridge (1.34) |
| `depth_anything_v2_small_bas_relief` (post-swap) | **passes** (bg 0.19, sep 0.39, ridge 0.38, face yes) | **passes** (bg 0.24, sep 0.25, ridge 0.54, HF 0.014) |
| `segformer_masked_depth` (post-swap) | **passes** (bg 0.20, sep 0.45, ridge 0.28, face yes) | **passes** (bg 0.23, sep 0.26, ridge 0.54, HF 0.011) |
| `triposr_sidecar` | **rejected** (face = no on front-facing portrait, bg 0.79) | fails bg flatness (0.61) |
| `sam_masked_depth` (historical, pre-rename) | not a current provider; artifacts retained on disk for audit | same |

Two providers are now default-eligible by the calibrated gates: `depth_anything_v2_small_bas_relief` (no mask) and `segformer_masked_depth` (with subject mask). Both produce true compressed reliefs. All other providers are correctly classified as either deterministic safety-net (luminance/lithophane) or wrong-shape (raw depth, image-to-3D).

Two gating modes:

- **Strict (default-fallback eligibility):** all gates must pass on all canonical inputs.
- **Opt-in (prototype eligibility):** subject/background separation + composition gradient correlation + hard mask ridge required; the rest reported but not blocking.

Implementation notes:

- Gates compute **per-provider** within each role. Same metric, same input set, every registered provider for the role runs through the gate. Result: a comparison matrix that drives registry priority order.
- The mask used by the gate must come from a different source than the mask used by the provider being tested, or the test is circular. Pick one canonical mask (cached call to a fixed segmentation provider per input) and use it for all candidates.
- Calibrate thresholds against the existing five experiments first. Pick values that admit Experiment 4 and reject TripoSR. That makes the gates retroactively explain existing decisions, which is the right sanity check.
- Pin the face detector model and version. A detector upgrade should not silently change which providers pass.
- Tag canonical corpus inputs as portrait/non-portrait so the right gates run.
- Hold out a few unseen inputs from threshold calibration as a sanity set.
- Latency and cost in production are observed via Cloud Logging / Cloud Monitoring per provider, with rolling p50/p95 published into the registry health view. CI gates the synthetic numbers; production gates the actual ones.

### 4. SAM/SegFormer naming mismatch — resolved 2026-05-09

The provider was originally registered as `sam_masked_depth` but uses `nvidia/segformer-b0-finetuned-ade-512-512`.

Decision: provider renamed to `segformer_masked_depth` on 2026-05-09. The class is now `SegformerMaskedDepthProvider`. Code, tests, and docs are updated. Historical artifacts under `.tmp/experiments/experiment_4/sam_masked_depth/` retain the original name, including baked-in `metadata.json` values, as a record of what was actually run.

Remaining follow-ups under this item:

- Capture the segmentation model identifier in `metadata.json` for new runs so future debugging can tell which model produced a given mesh (the rename addresses the public name; the metadata field future-proofs against the next swap).
- Audit any user-facing copy (UI labels, marketing) for stale "SAM" mentions before the provider is exposed to end users.

### 5. Replace the Experiment 3 transform inside the hybrid, not as its own provider

The doc correctly says the current Experiment 3 transform is too subtle. The transform at [services/print-file-generator/app/depth.py:759](services/print-file-generator/app/depth.py:759) is structurally a no-op: `compression_factor = 1.0 − (normalized_gradient × strength)` is dominated by the maximum gradient (silhouette edges), so for almost every interior pixel `compression_factor ≈ 1.0` and `relief ≈ depth`. The 146/65535 mean abs diff is the algorithm doing what it's coded to do, not a tuning miss.

The replacement should happen inside the hybrid pipeline, not as a standalone Experiment 6 cycle. The hybrid already needs a real compression stage between depth and mesh generation, so this is the same work, sequenced differently.

Decision (2026-05-09): replaced `_apply_bas_relief_transform` with **guided filter detail/base separation**. Implemented in place at [services/print-file-generator/app/depth.py](services/print-file-generator/app/depth.py); both `DepthAnythingV2SmallBasReliefProvider` and `SegformerMaskedDepthProvider` pick up the new transform automatically.

Implementation (~80 lines added: `_box_filter` + `_guided_filter_self` + new `_apply_bas_relief_transform` body):

```text
B = _guided_filter_self(D, radius=15, eps=0.01)   # base / global shape
detail = D - B
B' = (B - B.min()) / B.span * target_range + (1 - target_range) / 2.0
D' = clip(B' + 1.5 * detail, 0, 1)
```

`target_range = clip(1.0 - compression_strength, 0.1, 1.0)`. Default `compression_strength = 0.75` yields a base spanning 0.25 of [0, 1] centered on 0.5. `_box_filter` is a summed-area-table-based mean filter (pure numpy, no opencv-contrib or kornia dependency). Maps directly to Durand & Dorsey 2002 HDR tone-mapping with depth in place of log luminance.

Measured impact on a synthetic 200×280 input (gradient + ε noise, equivalent shape to the production heightmaps):

| | Old transform | New (guided filter) |
|---|---:|---:|
| Mean abs diff vs input (16-bit) | ~146 | **11,914** (≈81× larger) |
| Output range span | ~input span | 0.40 (compressed from 1.00 input) |
| Wall clock | n/a | 4.5 ms |

The previous transform's 146/65535 diff was the regression-canary target value to beat. New unit test [test_bas_relief_transform_is_not_a_noop](services/print-file-generator/tests/test_depth.py) asserts ≥ 1500, and actual values land 8× above that threshold so accidental regression to a no-op is caught.

Additional unit tests:

- `test_bas_relief_transform_compresses_global_range`: gradient input span 1.0 must compress to < 0.6.
- `test_bas_relief_transform_preserves_local_detail`: a small bump on a steep gradient must remain raised relative to its surround after compression.
- `test_bas_relief_transform_handles_empty_input` / `..._constant_input`: edge cases don't NaN or raise.

Fallback ladder (not yet needed; recorded for the hybrid build):

- **Gradient-domain Poisson reconstruction with Fattal attenuation** if guided filter introduces halos near subject silhouettes. ~100 lines plus an FFT-based Poisson solver. This is the canonical bas-relief literature approach (Weyrich et al. 2007, Cignoni et al. 1997).
- **Stop tuning the compression stage** if Poisson also fails portrait identity. The gap is upstream — Depth Anything V2 doesn't capture eye/smile geometry, and no downstream stage can recover it. Route through the hybrid's lithophane detail-blend layer instead. Do not reach for a learned bas-relief model first.

**Validation against canonical inputs (2026-05-09):** experiments 3 and 4 were re-run with the new transform. New artifacts under `.tmp/experiments/experiment_3/depth_anything_v2_small_bas_relief/` and `.tmp/experiments/experiment_4/segformer_masked_depth/`; historical `sam_masked_depth/` artifacts retained for audit. The recalibrated quality gates in item 3 admit both post-swap providers and reject every other provider correctly. Heightmaps reviewed visually — they look right.

The recalibration of item 3's thresholds is itself a finding: the original calibration was wrong because it ran against artifacts produced by a no-op transform. After the swap, background flatness becomes the primary discriminator (≤ 0.25 mm cleanly identifies "this provider actually compresses global range"), and subject/background separation drops to a weak gate. See item 3's methodological note.

### 6. Failure mode for the masked provider — multi-provider chain

`segformer_masked_depth` currently:

- Hardcodes one segmentation provider (HF Inference) and one model (SegFormer/ADE20K).
- Hardcodes `background_scale = 0.3`.
- On empty/full mask, silently returns `np.ones` with no metadata signal.
- On API failure, raises with no fallback.

Under the API-first/registry architecture from "Production Architecture Context," the failure-mode design becomes:

1. **Try alternate providers within the segmentation role first.** The `SubjectSegmentationProvider` registry has a primary (e.g., Vertex AI Vision segmentation if available, otherwise HF Inference SegFormer) and a fallback chain. On `RuntimeError` from any provider call, retry per the registry's retry policy, then fall through to the next provider in the chain.
2. **Only after every segmentation provider in the chain fails, fall through to the unmasked depth provider** (`depth_anything_v2_small_bas_relief` today, or whatever the corresponding `MonocularDepthProvider` resolves to in production).
3. **The deterministic chain (`posterized_luminance` etc.) is the last-resort safety net** — only reached when both the segmentation chain and the depth chain are exhausted.

Configuration and audit:

- `background_scale` becomes a per-request parameter with a documented default, plus a per-input override capability in the registry config.
- Every job writes a `provider_audit` field to its Firestore document recording, per role, which provider actually served the request and any fallbacks taken (e.g., `segmentation: { attempted: ["vertex", "hf-segformer"], succeeded: "hf-segformer", fallback_reason: "vertex_5xx" }`).
- The empty/full-mask cases get explicit metadata: `segmentation_status: "empty_mask" | "full_image_mask" | "ok"` instead of silent `np.ones`. These are not API failures; they are "the model ran but the result is unusable" — a separate signal from "the API call failed."

Auth on the segmentation call:

- Where the provider is GCP-native (Vertex), use service-account ADC. No API key.
- Where the provider is external (HF, Cloudflare-gatewayed HF), the API key comes from Secret Manager in production, mounted into the Cloud Run service. The current `.env` and `HUGGINGFACE_API_KEY` paths stay as the dev fallback.

### 7. Production caching and multi-provider routing for Experiment 4

Findings from reading [services/print-file-generator/app/depth.py](services/print-file-generator/app/depth.py), framed against the production architecture in the section above. "Offline" is no longer treated as a goal — the product is API-first on Firebase/GCP. The relevant questions are: where does caching live, how do we route across providers, and what happens when a provider is degraded.

**Provider classification by network dependency (current state):**

| Provider | Network on first run | Network per request | Production-shape? |
|---|---|---|---|
| `posterized_luminance` | No | No | Last-resort deterministic fallback |
| `continuous_luminance` | No | No | Last-resort deterministic fallback |
| `lithophane_baseline` | No | No | Last-resort deterministic fallback |
| `depth_anything_v2_small` | Yes (local weight download) | No | **No — local inference, dev-only** |
| `depth_anything_v2_small_bas_relief` | Yes (local weight download) | No | **No — local inference, dev-only** |
| `segformer_masked_depth` | Yes (local weight download for depth) | Yes (HF Inference for segmentation) | **Partial — segmentation is API but depth is local** |
| `triposr_sidecar` | No | Yes (Tripo API per request) | Rejected for product |

The local Depth Anything pipeline currently runs in-process; for production it should be replaced with calls through a `MonocularDepthProvider` registry entry (Vertex if available, HF Inference hosted Depth Anything otherwise, Cloudflare-gatewayed equivalent as fallback). The deterministic chain stays as the bottom-of-stack last-resort safety net.

**Network calls per `segformer_masked_depth` request:**

1. **Depth Anything V2 Small.** Loaded via `transformers.pipeline()` ([depth.py:933](services/print-file-generator/app/depth.py:933)). First call downloads weights to the standard HF cache (`~/.cache/huggingface/hub/`). Subsequent calls run locally. Pipeline factory has `@lru_cache(maxsize=1)` so the model is loaded once per process. Good.
2. **SegFormer (`nvidia/segformer-b0-finetuned-ade-512-512`).** HTTP POST to `https://router.huggingface.co/hf-inference/models/nvidia/segformer-b0-finetuned-ade-512-512` ([depth.py:740](services/print-file-generator/app/depth.py:740)) on **every request**. No client-side caching.

**Token loading:**

- Reads `HUGGINGFACE_API_KEY` first, then `HF_TOKEN`.
- Falls back to project-root `.env` via `python-dotenv` if installed.
- **Gap:** `python-dotenv` is not declared in `pyproject.toml`. The `.env` fallback silently no-ops if it isn't installed.

**Caching today:**

- In-process: only the Depth Anything pipeline factory (`@lru_cache(maxsize=1)`).
- SegFormer call: **no cache.** Two requests with the same input image hit the API twice.
- No on-disk cache for SegFormer responses.

**Failure behavior today:**

| Failure | Current behavior |
|---|---|
| HF API returns non-200 | `RuntimeError` raised with status + first 300 chars of response. Propagates to caller. No retry, no backoff, no local fallback. |
| Network unreachable | `requests.post` raises (timeout=120s). Propagates as `RuntimeError`. |
| Missing `HUGGINGFACE_API_KEY` / `HF_TOKEN` | `RuntimeError` with instructions to set the env var. |
| Missing `requests` package | `RuntimeError` instructing pip install. (`requests` is not in `pyproject.toml`.) |
| Mask covers > 90% of image OR 0 pixels | Internal fallback to all-subject mask (`np.ones`). **Not surfaced in metadata.** Caller has no way to tell this happened. |
| Mask area between 0% and 90% but no foreground labels found | Same all-subject fallback, same lack of signal. |

**Implicit dependency gaps in `pyproject.toml`:**

- `requests`: imported in `HfInferenceSegmentationProvider._call_api` and `_infer_triposr_api`, not declared.
- `python-dotenv`: imported as the `.env` fallback, not declared (silent miss is acceptable but should be intentional).
- `torch`, `transformers`: declared under `[project.optional-dependencies] experiments`. The masked provider does not declare itself as part of the `experiments` extra, so a fresh install + masked-provider request fails with "install torch and transformers."

**Production architecture verdict:**

- The current direct `requests.post` to a hardcoded HF Inference URL is dev-grade. It does not match the existing `aiProvider.ts` pattern, does not flow through Cloudflare AI Gateway, has no fallback chain, no Cloud Logging trace, and no cache.
- For production, segmentation and monocular-depth roles should be served through the registry described in "Production Architecture Context." The current code becomes the *HF Inference implementation* of `SubjectSegmentationProvider`, not the only path.

**Recommended changes (deferred — implement during hybrid build):**

1. **Lift segmentation behind a `SubjectSegmentationProvider` interface** modeled on `PosterAiProvider`. Implementations: Vertex (if it serves the role), HF Inference (current SegFormer code, refactored), Cloudflare-gatewayed. Selection driven by registry config in Firestore (or typed config under `infra/firebase/`).
2. **Lift monocular depth behind a `MonocularDepthProvider` interface** with the same shape. Implementations: HF Inference (Depth Anything V2 hosted), Vertex (if available), Cloudflare-gatewayed equivalent. Local in-process Depth Anything stays as a dev-only implementation, not registered for production routes.
3. **Content-hash cache backed by Firebase Storage.**
   - Key: `sha256(image_bytes) + role + provider_id + model_version`.
   - Value: provider response payload (e.g., the JSON SegFormer body, ~tens of KB; or the depth tensor as a compressed PNG).
   - Path: `cache/{role}/{provider_id}/{model_version}/{sha256}.{ext}` in the existing Firebase Storage bucket.
   - TTL: infinite — the (input, role, provider, model-version) tuple is deterministic. Invalidate only by changing the registry's `model_version` field.
   - For very small responses or high-frequency lookups, Firestore is also acceptable; pick the backing store per role based on payload size.
4. **Multi-provider failover** as described in item 6. Provider chain executes per the registry config; per-job audit written to Firestore.
5. **Cloudflare AI Gateway for cross-provider observability.** Where a role's providers can be served through Cloudflare's gateway, prefer that path so cost/latency/error metrics flow through the same pane as the existing `cloudflare-ai-gateway` route in `aiProvider.ts`.
6. **Auth via Secret Manager in production.** HF and other external API keys move from `.env` to GCP Secret Manager, mounted at runtime to the print-file-generator Cloud Run service. Vertex calls use service-account ADC, no key.
7. **Declare implicit deps explicitly in `pyproject.toml`.** `requests` and `python-dotenv` should be explicit. Reframe: `segformer_masked_depth` and `depth_anything_v2_small*` providers (the current local-inference experiments) move into an `experiments` extra and **stay there**; production segmentation and depth providers under the registry don't need `torch`/`transformers` in default deps.
8. **Capture per-job provider audit fields.** In each job's metadata: per-role `attempted` chain, `succeeded` provider, `fallback_reason` (if any), provider/model version, segmentation status (`ok` / `empty_mask` / `full_image_mask` / `api_failure`).

**Test coverage:**

[tests/test_providers.py](services/print-file-generator/tests/test_providers.py) covers chain failover, audit population, stub providers raising `ProviderError` cleanly, and the SegFormer foreground/background label merge. `tests/test_depth.py` keeps monkeypatching `_infer_depth_anything_v2_small` and `_generate_subject_mask` at the shim level — both shims now delegate to chains, so the heightmap-provider tests are unaffected by the refactor.

Still missing, for the production registry:

- Cache hit/miss tests (no cache layer wired yet).
- Cloud Logging emission tests (no observability layer wired yet).
- Token loading via Secret Manager (currently env / `.env` only).

### 8. Add a rejection list, not just a rejection note

Experiment 5 rejects TripoSR and lists Stable Fast 3D, TRELLIS, SAM 3D Objects, and TriplaneGaussian as "do not continue near-term." That is a useful list. It should be promoted into the final evaluation as a named "Rejected Until Product Scope Changes" section, with a one-line trigger condition for revisiting (for example "only revisit if product expands to standalone figurines").

This prevents future cycles from quietly re-running the same class of experiment.

## Recommended Final Recommendation Wording

Replace the current "Final Recommendation" with:

> The five-experiment cycle is complete. The next deliverable is an implementation, not another experiment cycle.
>
> The product path forward is a server-side relief pipeline that combines semantic depth (Experiment 2), subject masking (Experiment 4 base), controlled subject-only detail recovery (sourced from a deterministic provider — `lithophane_baseline` or `posterized_luminance`), and a real bas-relief compression stage (replacing Experiment 3's placeholder transform), feeding the existing deterministic STL/GLB generator.
>
> The next provider is `masked_depth_detail_blend`, opt-in only.
>
> The deterministic fallback choice between `posterized_luminance` and `lithophane_baseline` will be settled as a side effect of building the hybrid: the detail source that wins inside the mask also becomes the fallback default.
>
> The Experiment 3 transform will be replaced inside the hybrid pipeline rather than as its own provider iteration.
>
> Full image-to-3D reconstruction is rejected for this product. It will only be revisited if the product scope expands to standalone figurines.

## Net Position

The strategic conclusions in the final evaluation are correct. Status of the remaining work:

Done (2026-05-09):

- ~~Treat the SAM/SegFormer mismatch as a release blocker, not a cleanup item.~~ Provider renamed to `segformer_masked_depth`.
- ~~Convert subjective quality gates into measurable, per-provider ones.~~ Landed in [app/quality_gates.py](services/print-file-generator/app/quality_gates.py); thresholds calibrated, then recalibrated after the bas-relief swap.
- ~~Replace the Experiment 3 no-op bas-relief transform.~~ Guided-filter detail/base separation in [app/depth.py](services/print-file-generator/app/depth.py); experiments 3 and 4 re-run; new heightmaps look right; recalibrated gates pass cleanly.
- ~~Lift monocular depth and subject segmentation behind typed provider interfaces.~~ Scaffolding in [app/providers/](services/print-file-generator/app/providers/). Vertex / HF Inference / Cloudflare-gateway implementations are stubs; concrete HF SegFormer + local Depth Anything are wired through chains with audit trail.
- ~~Define the masked-provider failure mode as a multi-provider chain.~~ `SubjectSegmentationChain.segment` falls through on `ProviderError` and records the attempted chain in `ProviderAudit`. Tests cover the behavior.

Done after this review (2026-05-10):

- Built the opt-in `masked_depth_detail_blend` provider. It combines semantic depth, subject masking, subject-only deterministic detail, guided-filter compression, and the existing deterministic STL/GLB generator.
- Ran both canonical inputs through `masked_depth_detail_blend` with `lithophane_baseline` and `posterized_luminance` as detail sources. Both variants passed the calibrated gates. Keep `lithophane_baseline` as the first hybrid in-mask detail source for identity readability; keep `posterized_luminance` available as the lower-noise comparison/default-checkout path.

Outstanding after the hybrid build:

- Wire `ProviderAudit` into per-job `metadata.json` and the eventual Firestore audit document. The audit objects are produced today but not surfaced.
- Cache provider responses by content hash in Firebase Storage. Cache key = `sha256(image_bytes) + role + provider_id + model_version`.
- Implement `VertexSegmentationProvider`, `HfInferenceDepthAnythingProvider`, `VertexDepthProvider`, `CloudflareGatewaySegmentationProvider`. Stubs raise `ProviderError` so the chain falls through cleanly.
- Replace the dropped composition-preservation gate with a relief-appropriate metric. Landed as `composition_gradient_correlation`, which compares source-image edge placement to heightmap edge placement without depending on brightness polarity.
- Surface segmentation status (`ok` / `empty_mask` / `full_image_mask` / `api_failure`) into job metadata.
- Declare implicit deps (`requests`, `python-dotenv`) in `pyproject.toml`.

No new experiment cycle is recommended. All outstanding work happens inside the hybrid build against the production architecture.
