"""Calibration-mode test for the quality-gate harness.

Discovers every (provider, input) bundle under .tmp/experiments/, computes
the metrics from app.quality_gates, and writes one JSON report per bundle
to .tmp/quality_gates/. Asserts only that metrics are computable (not
NaN/inf) where inputs were available. v2 adds hard threshold assertions.

Run with: pytest tests/unit/test_quality_gates.py -q
View results: scripts/run_quality_gates.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
import pytest

from app.quality_gates import (
    composition_gradient_correlation,
    compute_all_gates,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
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
    for metadata_path in sorted(EXPERIMENTS_DIR.glob("*/*/*/metadata.json")):
        heightmap_path = metadata_path.parent / "heightmap.png"
        if not heightmap_path.exists():
            continue
        try:
            metadata = json.loads(metadata_path.read_text())
        except json.JSONDecodeError:
            continue
        provider = metadata.get("height_provider") or metadata_path.parent.parent.name
        provider_settings = metadata.get("provider_settings") or {}
        if provider == "masked_depth_detail_blend" and provider_settings.get("detail_source"):
            provider = f"{provider}__{provider_settings['detail_source']}"
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


def test_composition_gradient_correlation_rewards_aligned_edges(tmp_path: Path) -> None:
    source_path = tmp_path / "source.png"
    source = Image.new("L", (64, 64), color=0)
    source_pixels = source.load()
    for y in range(16, 48):
        for x in range(16, 48):
            source_pixels[x, y] = 255
    source.save(source_path)

    heightmap = np.zeros((64, 64), dtype=np.float32)
    heightmap[16:48, 16:48] = 1.0

    score = composition_gradient_correlation(source_path, heightmap)

    assert score > 0.95


def test_composition_gradient_correlation_penalizes_misaligned_edges(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "source.png"
    source = Image.new("L", (64, 64), color=0)
    source_pixels = source.load()
    for y in range(16, 48):
        for x in range(16, 48):
            source_pixels[x, y] = 255
    source.save(source_path)

    heightmap = np.zeros((64, 64), dtype=np.float32)
    heightmap[4:20, 4:20] = 1.0

    score = composition_gradient_correlation(source_path, heightmap)

    assert score < 0.25


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
    result["provider"] = provider

    out_path = REPORT_DIR / f"{provider}__{job_id}.json"
    out_path.write_text(json.dumps(result, indent=2, default=str))

    for name, value in result["metrics"].items():
        if isinstance(value, float):
            assert not math.isnan(value), f"{name} is NaN for {provider}/{job_id}"
            assert not math.isinf(value), f"{name} is inf for {provider}/{job_id}"
