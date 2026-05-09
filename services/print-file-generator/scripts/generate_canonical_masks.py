"""Generate canonical subject masks for the quality-gate harness.

Calls the SegFormer subject-mask helper from app.depth once per canonical
input and saves a binary mask PNG to .tmp/canonical_masks/{job_id}.png.

Run once locally:

    HUGGINGFACE_API_KEY=... python scripts/generate_canonical_masks.py

The harness in tests/test_quality_gates.py reads the cached masks and
skips mask-dependent metrics for inputs without a cached mask.

Limitation: the canonical mask source is currently the same SegFormer
model used by segformer_masked_depth, which makes the gate's evaluation
of that provider technically circular. Acceptable for v1 calibration; v2
should swap to an alternate segmentation source (Vertex Vision,
hand-authored, etc.) before gates run in strict mode.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


HERE = Path(__file__).resolve().parent
SERVICE_ROOT = HERE.parent
REPO_ROOT = SERVICE_ROOT.parent.parent

sys.path.insert(0, str(SERVICE_ROOT))

from app.depth import _generate_subject_mask  # noqa: E402


INPUT_DIR = REPO_ROOT / ".tmp" / "input_image"
OUT_DIR = REPO_ROOT / ".tmp" / "canonical_masks"

INPUTS = [
    INPUT_DIR / "Profile-Pic-HIMSS.jpg",
    INPUT_DIR / "Gemini_Generated_Image_lzneejlzneejlzne.png",
]


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for path in INPUTS:
        if not path.exists():
            print(f"Skipping missing input: {path}")
            continue

        out = OUT_DIR / f"{path.stem}.png"
        if out.exists():
            print(f"Already cached: {out}")
            continue

        image = Image.open(path).convert("RGB")
        mask = _generate_subject_mask(image, blur_radius_px=0.0)
        binary = (mask > 0.5).astype(np.uint8) * 255
        Image.fromarray(binary, mode="L").save(out)
        print(f"Wrote: {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
