"""Calibration-mode test for the quality-gate harness.

Discovers every (provider, input) bundle under .tmp/experiments/, computes
the metrics from app.quality_gates, and writes one JSON report per bundle
to .tmp/quality_gates/. Asserts only that metrics are computable (not
NaN/inf) where inputs were available. v2 adds hard threshold assertions.

Run with: pytest tests/test_quality_gates.py -q
View results: scripts/run_quality_gates.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.quality_gates import compute_all_gates


REPO_ROOT = Path(__file__).resolve().parents[3]
EXPERIMENTS_DIR = REPO_ROOT / ".tmp" / "experiments"
INPUT_DIR = REPO_ROOT / ".tmp" / "input_image"
CANONICAL_MASK_DIR = REPO_ROOT / ".tmp" / "canonical_masks"
REPORT_DIR = REPO_ROOT / ".tmp" / "quality_gates"

INPUT_EXTENSIONS = {
    "Profile-Pic-HIMSS": ".jpg",
    "Gemini_Generated_Image_lzneejlzneejlzne": ".png",
}


def _discover_bundles() -> list[tuple[str, str, Path, Path]]:
    """Yield (provider, job_id, heightmap_path, metadata_path) for each bundle."""
    if not EXPERIMENTS_DIR.exists():
        return []

    bundles: list[tuple[str, str, Path, Path]] = []
    for metadata_path in sorted(EXPERIMENTS_DIR.glob("experiment_*/*/*/metadata.json")):
        heightmap_path = metadata_path.parent / "heightmap.png"
        if not heightmap_path.exists():
            continue
        try:
            metadata = json.loads(metadata_path.read_text())
        except json.JSONDecodeError:
            continue
        provider = metadata.get("height_provider") or metadata_path.parent.parent.name
        job_id = metadata.get("job_id") or metadata_path.parent.name
        if str(job_id).startswith("experiment_"):
            continue  # skip smoke fixtures
        bundles.append((provider, job_id, heightmap_path, metadata_path))
    return bundles


def _source_image_path(job_id: str) -> Path | None:
    ext = INPUT_EXTENSIONS.get(job_id)
    if ext is None:
        return None
    candidate = INPUT_DIR / f"{job_id}{ext}"
    return candidate if candidate.exists() else None


def _canonical_mask_path(job_id: str) -> Path | None:
    candidate = CANONICAL_MASK_DIR / f"{job_id}.png"
    return candidate if candidate.exists() else None


_BUNDLES = _discover_bundles()


@pytest.mark.skipif(not _BUNDLES, reason="No experiment bundles under .tmp/experiments/")
@pytest.mark.parametrize(
    "provider,job_id,heightmap_path,metadata_path",
    _BUNDLES,
    ids=[f"{p}__{j}" for (p, j, _, _) in _BUNDLES],
)
def test_quality_gates_computable(
    provider: str,
    job_id: str,
    heightmap_path: Path,
    metadata_path: Path,
) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    result = compute_all_gates(
        heightmap_path,
        metadata_path,
        subject_mask_path=_canonical_mask_path(job_id),
        source_image_path=_source_image_path(job_id),
    )

    out_path = REPORT_DIR / f"{provider}__{job_id}.json"
    out_path.write_text(json.dumps(result, indent=2, default=str))

    for name, value in result["metrics"].items():
        if isinstance(value, float):
            assert not math.isnan(value), f"{name} is NaN for {provider}/{job_id}"
            assert not math.isinf(value), f"{name} is inf for {provider}/{job_id}"
