"""Promote the gold-standard square figurine base into a clean reusable service asset.

The gold-standard export at
`.tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl`
is a personalized sample: it contains raised "Elliott" lettering baked onto the
front plaque. This script deterministically derives the clean reusable asset:

1. Load the gold-standard STL (raw Meshy scene units, Z-up).
2. Scale by the approved figurine scale contract factor (78.978034802) to millimeters.
3. Split into bodies and drop the lettering bodies (small meshes mounted proud of
   the front plaque plane).
4. Boolean-union the remaining structural bodies into one watertight mesh.
5. Measure the front plaque planes (outer frame plane and recessed name panel)
   plus the approved lettering style observed on the sample.
6. Export `base.stl` (millimeters, Z-up), `base-preview.glb` (raw Meshy scale,
   Y-up, for UI preview fit against raw Creative Lab GLBs), and
   `base.manifest.json`.

Usage:
    python scripts/promote_square_base_asset.py \
        --source ".tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl" \
        --out services/print-file-generator/assets/figurine-bases/figurine-square-v1
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
import trimesh

SCALE_CONTRACT_FACTOR = 78.978034802
TARGET_FIGURINE_HEIGHT_MM = 150.0
LETTER_BODY_MAX_EXTENT_MM = 15.0
ASSET_ID = "figurine-square-v1"


def _front_plane_normal(plaque: trimesh.Trimesh) -> np.ndarray:
    """Dominant outward normal of the sloped front plaque faces."""
    normals = plaque.face_normals
    front = normals[normals[:, 1] < -0.8]
    if len(front) == 0:
        raise ValueError("No front-facing plaque faces found.")
    keys, counts = np.unique(np.round(front, 4), axis=0, return_counts=True)
    normal = keys[np.argmax(counts)].astype(float)
    return normal / np.linalg.norm(normal)


def _plane_offset_clusters(plaque: trimesh.Trimesh, normal: np.ndarray) -> tuple[float, float]:
    """Return (outer_frame_offset, recessed_panel_offset) along `normal`.

    Larger offset means farther toward the viewer (more negative Y).
    """
    mask = plaque.face_normals @ normal > 0.999
    verts = plaque.vertices[plaque.faces[mask]].reshape(-1, 3)
    d = verts @ normal
    lo, hi = d.min(), d.max()
    mid = (lo + hi) / 2.0
    panel = float(np.median(d[d < mid]))
    frame = float(np.median(d[d >= mid]))
    return frame, panel


def _panel_rect(plaque: trimesh.Trimesh, normal: np.ndarray, panel_offset: float) -> dict:
    """World-space rectangle of the recessed name panel faces."""
    mask = plaque.face_normals @ normal > 0.999
    verts = plaque.vertices[plaque.faces[mask]].reshape(-1, 3)
    d = verts @ normal
    panel = verts[np.abs(d - panel_offset) < 0.2]
    return {
        "xMinMm": float(panel[:, 0].min()),
        "xMaxMm": float(panel[:, 0].max()),
        "zMinMm": float(panel[:, 2].min()),
        "zMaxMm": float(panel[:, 2].max()),
    }


def promote(source: Path, out_dir: Path) -> dict:
    raw = trimesh.load(source, force="mesh")
    mesh_mm = raw.copy()
    mesh_mm.apply_scale(SCALE_CONTRACT_FACTOR)

    bodies = mesh_mm.split(only_watertight=False)
    structural: list[trimesh.Trimesh] = []
    letters: list[trimesh.Trimesh] = []
    for body in bodies:
        if bool(np.all(body.extents < LETTER_BODY_MAX_EXTENT_MM)):
            letters.append(body)
        else:
            structural.append(body)
    if len(structural) != 3:
        raise ValueError(
            f"Expected 3 structural bodies (slab, inset slab, plaque); got {len(structural)}."
        )
    if len(letters) == 0:
        raise ValueError("Expected baked-in lettering bodies in the gold-standard sample.")

    # The plaque is the structural body that protrudes farthest toward -Y.
    plaque = min(structural, key=lambda b: b.bounds[0][1])
    normal = _front_plane_normal(plaque)
    frame_offset, panel_offset = _plane_offset_clusters(plaque, normal)
    panel_rect = _panel_rect(plaque, normal, panel_offset)

    letter_verts = np.vstack([b.vertices for b in letters])
    letter_d = letter_verts @ normal
    proud_of_panel = float(letter_d.max() - panel_offset)
    embedded_behind_panel = float(panel_offset - letter_d.min())
    proud_of_frame = float(letter_d.max() - frame_offset)

    # In-plane frame: u = world +X, v = up-slope direction on the plane.
    u = np.array([1.0, 0.0, 0.0])
    v = np.cross(normal, u)
    v = v / np.linalg.norm(v)

    # Sample lettering box (world) -> in-plane sizing for the manifest.
    sample_width_mm = float(letter_verts[:, 0].max() - letter_verts[:, 0].min())
    sample_z_min = float(letter_verts[:, 2].min())
    sample_z_max = float(letter_verts[:, 2].max())
    sample_height_in_plane_mm = float((sample_z_max - sample_z_min) / abs(v[2]))
    sample_center_z = (sample_z_min + sample_z_max) / 2.0

    plaque_x_min = float(plaque.bounds[0][0])
    plaque_x_max = float(plaque.bounds[1][0])

    clean = trimesh.boolean.union(structural, engine="manifold")
    if not clean.is_watertight:
        raise ValueError("Clean base union is not watertight.")

    out_dir.mkdir(parents=True, exist_ok=True)
    stl_path = out_dir / "base.stl"
    clean.export(stl_path)

    # Preview GLB in raw Meshy scene scale, Y-up, to sit next to raw Creative Lab GLBs.
    preview = clean.copy()
    preview.apply_scale(1.0 / SCALE_CONTRACT_FACTOR)
    preview.apply_transform(
        trimesh.transformations.rotation_matrix(-np.pi / 2.0, [1.0, 0.0, 0.0])
    )
    glb_path = out_dir / "base-preview.glb"
    preview.export(glb_path)

    manifest = {
        "baseId": ASSET_ID,
        "assetVersion": "1.0.0",
        "created": date.today().isoformat(),
        "status": "pending-approval",
        "derivedFrom": {
            "goldStandard": str(source),
            "scaleContract": {
                "factor": SCALE_CONTRACT_FACTOR,
                "targetFigurineHeightMm": TARGET_FIGURINE_HEIGHT_MM,
                "matchedJob": "f604d393-bfa2-4779-b05b-f6a2082604c9",
            },
            "removedBakedLettering": {
                "sampleName": "Elliott",
                "letterBodyCount": len(letters),
            },
        },
        "units": "millimeter",
        "coordinateSystem": {
            "zAxis": "up",
            "origin": "center-bottom",
            "front": "negative-y",
        },
        "files": {
            "stl": "base.stl",
            "previewGlb": "base-preview.glb",
            "previewGlbScale": "raw-meshy-scene-units-y-up",
        },
        "dimensionsMm": {
            "widthX": float(clean.extents[0]),
            "depthY": float(clean.extents[1]),
            "heightZ": float(clean.extents[2]),
        },
        "geometry": {
            "style": "square beveled pedestal with protruding sloped front plaque",
            "watertight": bool(clean.is_watertight),
            "faces": int(len(clean.faces)),
            "decorations": (
                "none baked into this asset; customer name text is deterministic "
                "add-on geometry on the front plaque panel"
            ),
        },
        "placementZones": {
            "topPlaneZMm": float(clean.bounds[1][2]),
            "nameTextZone": {
                "front": "negative-y",
                "surface": "sloped front plaque recessed panel",
                "plane": {
                    "normal": [float(x) for x in normal],
                    "outerFrameOffset": frame_offset,
                    "recessedPanelOffset": panel_offset,
                    "inPlaneRight": [float(x) for x in u],
                    "inPlaneUp": [float(x) for x in v],
                },
                "panelBoundsMm": {
                    "xMin": plaque_x_min,
                    "xMax": plaque_x_max,
                    "marginMm": 4.0,
                },
                "panelRectWorldMm": panel_rect,
                "defaultTextCenterWorldZMm": sample_center_z,
                "recommendedMaxCharacters": 12,
                "textPolicy": "deterministic raised geometry generated per order",
                "approvedSampleStyle": {
                    "sampleName": "Elliott",
                    "sampleWidthMm": sample_width_mm,
                    "sampleHeightInPlaneMm": sample_height_in_plane_mm,
                    "raisedProudOfPanelMm": proud_of_panel,
                    "embeddedBehindPanelMm": embedded_behind_panel,
                    "raisedProudOfFrameMm": proud_of_frame,
                },
            },
        },
        "checksum": {
            "stlSha256": hashlib.sha256(stl_path.read_bytes()).hexdigest(),
        },
        "notes": [
            "Derived deterministically from the personalized gold-standard sample by "
            "removing the baked Elliott lettering bodies and unioning the structural bodies.",
            "Customer name text is intentionally not baked into this asset.",
            "The approvedSampleStyle numbers reproduce the gold-standard lettering "
            "placement for deterministic name geometry.",
            "Meshy Creative Lab generates the figurine body only; this asset is for "
            "deterministic server-side assembly.",
        ],
    }
    manifest_path = out_dir / "base.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(".tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(f"services/print-file-generator/assets/figurine-bases/{ASSET_ID}"),
    )
    args = parser.parse_args()
    manifest = promote(args.source, args.out)
    print(json.dumps({k: manifest[k] for k in ("baseId", "dimensionsMm", "geometry")}, indent=2))
    print(f"Asset written to {args.out}")


if __name__ == "__main__":
    main()
