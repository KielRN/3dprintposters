"""Print a calibration table from quality-gate harness output.

Run after pytest tests/test_quality_gates.py has populated
.tmp/quality_gates/. Emits a side-by-side comparison of every (provider,
input) metric so thresholds can be calibrated against existing results.
"""

from __future__ import annotations

import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent.parent
REPORT_DIR = REPO_ROOT / ".tmp" / "quality_gates"

METRIC_ORDER = [
    "subject_background_separation_mm",
    "background_flatness_mm",
    "hard_mask_ridge_mm_per_pixel",
    "high_frequency_noise_ratio",
    "composition_gradient_correlation",
    "face_detected",
    "face_count",
]


def _format_value(value: object, width: int) -> str:
    if value is None:
        return f"{'(skip)':<{width}}"
    if isinstance(value, bool):
        return f"{'yes' if value else 'no':<{width}}"
    if isinstance(value, float):
        return f"{value:<{width}.4f}"
    if isinstance(value, int):
        return f"{value:<{width}}"
    return f"{str(value):<{width}}"


def main() -> int:
    if not REPORT_DIR.exists():
        print(f"No report dir at {REPORT_DIR}.")
        print("Run: pytest tests/test_quality_gates.py -q")
        return 1

    files = sorted(REPORT_DIR.glob("*.json"))
    if not files:
        print(f"No reports in {REPORT_DIR}.")
        return 1

    rows = [json.loads(f.read_text()) for f in files]
    job_ids = sorted({r["job_id"] for r in rows})

    for job_id in job_ids:
        print(f"\n=== {job_id} ===")
        job_rows = sorted(
            (r for r in rows if r["job_id"] == job_id),
            key=lambda r: r["provider"],
        )
        provider_width = max(len("provider"), max(len(r["provider"]) for r in job_rows))
        widths = {m: max(len(m), 12) for m in METRIC_ORDER}

        header = f"{'provider':<{provider_width}} | " + " | ".join(
            f"{m:<{widths[m]}}" for m in METRIC_ORDER
        )
        print(header)
        print("-" * len(header))
        for r in job_rows:
            cells = [_format_value(r["metrics"].get(m), widths[m]) for m in METRIC_ORDER]
            print(f"{r['provider']:<{provider_width}} | " + " | ".join(cells))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
