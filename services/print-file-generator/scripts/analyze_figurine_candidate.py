#!/usr/bin/env python
"""Analyze figurine candidate geometry against the approved PrintU base."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True, help="Candidate label.")
    parser.add_argument("--output", required=True, help="JSON output path.")
    parser.add_argument("--base-manifest", required=True, help="printu-round-v1 base manifest.")
    parser.add_argument("--target-height-mm", type=float, default=75.0)
    parser.add_argument(
        "--model",
        action="append",
        default=[],
        help="Model entry as label=path. Can be supplied more than once.",
    )
    return parser.parse_args()


def load_scene_or_mesh(path: Path) -> tuple[trimesh.Trimesh, dict[str, Any]]:
    loaded = trimesh.load(path, force="scene")
    visual_summary: dict[str, Any] = {"geometry_count": 1, "visual_kinds": []}
    if isinstance(loaded, trimesh.Scene):
        visual_summary["geometry_count"] = len(loaded.geometry)
        visual_summary["visual_kinds"] = sorted(
            {
                type(geometry.visual).__name__
                for geometry in loaded.geometry.values()
                if hasattr(geometry, "visual")
            }
        )
        if hasattr(loaded, "to_geometry"):
            mesh = loaded.to_geometry()
        else:
            mesh = loaded.dump(concatenate=True)
    else:
        mesh = loaded
        visual_summary["visual_kinds"] = [type(mesh.visual).__name__]
    if not isinstance(mesh, trimesh.Trimesh):
        raise TypeError(f"Unsupported mesh type from {path}: {type(mesh)!r}")
    if mesh.vertices.size == 0 or mesh.faces.size == 0:
        raise ValueError(f"Input mesh is empty: {path}")
    return mesh, visual_summary


def orient_to_print_z_up(mesh: trimesh.Trimesh, path: Path) -> tuple[trimesh.Trimesh, str]:
    oriented = mesh.copy()
    if path.suffix.lower() in {".glb", ".gltf"}:
        transform = np.array(
            [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, -1.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            dtype=float,
        )
        oriented.apply_transform(transform)
        return oriented, "glb_y_up_to_print_z_up"
    return oriented, "assumed_print_z_up"


def edge_issue_counts(mesh: trimesh.Trimesh) -> dict[str, int]:
    if mesh.edges_unique_inverse.size == 0:
        return {"boundary_edges": 0, "overused_edges": 0, "non_manifold_edges": 0}
    counts = np.bincount(mesh.edges_unique_inverse)
    boundary = int(np.sum(counts == 1))
    overused = int(np.sum(counts > 2))
    return {
        "boundary_edges": boundary,
        "overused_edges": overused,
        "non_manifold_edges": boundary + overused,
    }


def degenerate_face_count(mesh: trimesh.Trimesh) -> int:
    if mesh.faces.size == 0:
        return 0
    scale = float(max(mesh.extents.max(), 1.0))
    tolerance = (scale * 1e-9) ** 2
    return int(np.sum(mesh.area_faces <= tolerance))


def mesh_summary(mesh: trimesh.Trimesh) -> dict[str, Any]:
    return {
        "bounds": mesh.bounds.tolist(),
        "extents": mesh.extents.tolist(),
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "is_watertight": bool(mesh.is_watertight),
        "is_volume": bool(mesh.is_volume),
        "volume": float(mesh.volume) if mesh.is_volume else None,
        "degenerate_faces": degenerate_face_count(mesh),
        **edge_issue_counts(mesh),
    }


def center_and_scale_to_height(mesh: trimesh.Trimesh, target_height_mm: float) -> tuple[trimesh.Trimesh, float]:
    scaled = mesh.copy()
    height = float(scaled.extents[2])
    if not math.isfinite(height) or height <= 0:
        raise ValueError(f"Model height must be positive; got {height!r}")
    scale_factor = target_height_mm / height
    scaled.apply_scale(scale_factor)
    bounds = scaled.bounds
    center_xy = (bounds[0, :2] + bounds[1, :2]) / 2.0
    scaled.apply_translation([-center_xy[0], -center_xy[1], -bounds[0, 2]])
    return scaled, float(scale_factor)


def footprint_summary(mesh: trimesh.Trimesh, base_manifest: dict[str, Any]) -> dict[str, Any]:
    height = float(mesh.extents[2])
    slice_height = max(0.8, height * 0.015)
    bottom_z = float(mesh.bounds[0, 2])
    selected = mesh.vertices[mesh.vertices[:, 2] <= bottom_z + slice_height]
    if selected.size == 0:
        selected = mesh.vertices[np.argsort(mesh.vertices[:, 2])[: min(100, len(mesh.vertices))]]
    xy = selected[:, :2]
    mins = xy.min(axis=0)
    maxs = xy.max(axis=0)
    extents = maxs - mins
    center = (mins + maxs) / 2.0
    radii_from_origin = np.linalg.norm(xy, axis=1)
    radii_from_foot_center = np.linalg.norm(xy - center, axis=1)
    placement = base_manifest["placementZones"]["footPlacementZone"]
    zone_radius = float(placement["radiusMm"])
    return {
        "slice_height_mm": slice_height,
        "vertex_count": int(len(selected)),
        "bounds_xy_mm": [[float(mins[0]), float(mins[1])], [float(maxs[0]), float(maxs[1])]],
        "extents_xy_mm": [float(extents[0]), float(extents[1])],
        "center_xy_mm": [float(center[0]), float(center[1])],
        "max_radius_from_origin_mm": float(radii_from_origin.max()),
        "max_radius_from_foot_center_mm": float(radii_from_foot_center.max()),
        "fits_printu_round_v1_zone": bool(radii_from_origin.max() <= zone_radius),
        "printu_round_v1_zone_radius_mm": zone_radius,
    }


def analyze_model(label: str, path: Path, base_manifest: dict[str, Any], target_height_mm: float) -> dict[str, Any]:
    mesh, visual = load_scene_or_mesh(path)
    oriented, orientation = orient_to_print_z_up(mesh, path)
    scaled, scale_factor = center_and_scale_to_height(oriented, target_height_mm)
    footprint = footprint_summary(scaled, base_manifest)
    return {
        "path": str(path),
        "format": path.suffix.lower().lstrip("."),
        "orientation": orientation,
        "visual": visual,
        "raw_provider_coordinates": mesh_summary(mesh),
        "print_z_up_coordinates": mesh_summary(oriented),
        "scaled_to_target_height": {
            "target_height_mm": target_height_mm,
            "scale_factor": scale_factor,
            "mesh": mesh_summary(scaled),
        },
        "underside_footprint": footprint,
        "fit_to_base": {
            "base_id": base_manifest.get("baseId"),
            "fits_foot_placement_zone": footprint["fits_printu_round_v1_zone"],
            "base_dimensions_mm": base_manifest.get("dimensionsMm"),
        },
    }


def parse_model_entries(entries: list[str]) -> list[tuple[str, Path]]:
    parsed = []
    for entry in entries:
        if "=" not in entry:
            raise ValueError(f"--model must be label=path; got {entry!r}")
        label, raw_path = entry.split("=", 1)
        parsed.append((label, Path(raw_path).resolve()))
    return parsed


def main() -> None:
    args = parse_args()
    output_path = Path(args.output).resolve()
    base_manifest = json.loads(Path(args.base_manifest).read_text(encoding="utf-8"))
    models = {}
    for model_label, model_path in parse_model_entries(args.model):
        models[model_label] = analyze_model(
            model_label,
            model_path,
            base_manifest,
            args.target_height_mm,
        )
    result = {
        "label": args.label,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_manifest": str(Path(args.base_manifest).resolve()),
        "target_height_mm": args.target_height_mm,
        "models": models,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "model_count": len(models)}, indent=2))


if __name__ == "__main__":
    main()
