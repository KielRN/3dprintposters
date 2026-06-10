"""Compose a customer-named figurine base from a reusable base asset.

Usage:
    python scripts/compose_named_base.py --name "Elliott" \
        --base-dir services/print-file-generator/assets/figurine-bases/figurine-square-v1 \
        --out .tmp/experiments/named-base/elliott

Outputs named-base.stl, named-base.3mf, named-base-preview.glb (raw Meshy
scene scale, Y-up), and metadata.json under --out.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.figurine_name_base import NameValidationError, export_named_base


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Customer sign name")
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "assets"
        / "figurine-bases"
        / "figurine-square-v1",
    )
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        metadata = export_named_base(args.base_dir, args.name, args.out)
    except NameValidationError as exc:
        print(f"Name validation failed: {exc}", file=sys.stderr)
        raise SystemExit(2)

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
