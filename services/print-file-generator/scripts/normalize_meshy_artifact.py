#!/usr/bin/env python
"""Normalize Meshy model artifacts to an explicit millimeter print scale.

This is an experiment-facing entry point for the future figurine composition
service. It can use Meshy's 3MF package as the print-scale reference while using
another asset, usually the GLB, as the geometry source.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


SUPPORTED_SOURCE_UP_AXES = {"auto", "y", "z"}
UNIT_TO_MM = {
    None: 1.0,
    "millimeter": 1.0,
    "millimetre": 1.0,
    "mm": 1.0,
    "micron": 0.001,
    "micrometer": 0.001,
    "centimeter": 10.0,
    "centimetre": 10.0,
    "meter": 1000.0,
    "metre": 1000.0,
    "inch": 25.4,
    "foot": 304.8,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Source Meshy model path, usually model.glb.")
    parser.add_argument(
        "--reference-3mf",
        help="Meshy 3MF path to use as millimeter scale reference when target height is omitted.",
    )
    parser.add_argument(
        "--target-height-mm",
        type=float,
        help="Explicit target model height in millimeters. Overrides --reference-3mf height.",
    )
    parser.add_argument("--output-dir", required=True, help="Directory for normalized outputs.")
    parser.add_argument(
        "--source-up-axis",
        default="auto",
        choices=sorted(SUPPORTED_SOURCE_UP_AXES),
        help="Source model up axis. Default auto treats GLB/GLTF as Y-up and print formats as Z-up.",
    )
    parser.add_argument(
        "--skip-basic-cleanup",
        action="store_true",
        help="Skip merge/remove-degenerate cleanup before export.",
    )
    return parser.parse_args()


def load_scene_or_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="scene")
    if isinstance(loaded, trimesh.Scene):
        if hasattr(loaded, "to_geometry"):
            mesh = loaded.to_geometry()
        else:
            mesh = loaded.dump(concatenate=True)
    else:
        mesh = loaded
    if not isinstance(mesh, trimesh.Trimesh):
        raise TypeError(f"Unsupported mesh type from {path}: {type(mesh)!r}")
    if mesh.vertices.size == 0 or mesh.faces.size == 0:
        raise ValueError(f"Input mesh is empty: {path}")
    return mesh


def mesh_units(mesh_or_scene: Any) -> str | None:
    units = getattr(mesh_or_scene, "units", None)
    if units:
        return str(units).lower()
    metadata = getattr(mesh_or_scene, "metadata", {}) or {}
    value = metadata.get("units")
    return str(value).lower() if value else None


def load_reference_height_mm(path: Path) -> dict[str, Any]:
    reference = trimesh.load(path, force="scene")
    bounds = np.asarray(reference.bounds, dtype=float)
    if bounds.shape != (2, 3) or not np.all(np.isfinite(bounds)):
        raise ValueError(f"Could not read reference bounds from {path}")
    unit = mesh_units(reference)
    unit_scale = UNIT_TO_MM.get(unit)
    if unit_scale is None:
        raise ValueError(f"Unsupported 3MF unit {unit!r} from {path}")
    extents = (bounds[1] - bounds[0]) * unit_scale
    return {
        "path": str(path),
        "units": unit or "millimeter",
        "unit_scale_to_mm": unit_scale,
        "bounds_mm": (bounds * unit_scale).tolist(),
        "extents_mm": extents.tolist(),
        "height_mm": float(extents[2]),
    }


def resolve_source_up_axis(source: Path, requested: str) -> str:
    if requested != "auto":
        return requested
    if source.suffix.lower() in {".glb", ".gltf"}:
        return "y"
    return "z"


def orient_to_print_z_up(mesh: trimesh.Trimesh, source_up_axis: str) -> trimesh.Trimesh:
    oriented = mesh.copy()
    if source_up_axis == "y":
        # glTF/GLB is Y-up. Print packages use Z-up. Map (x, y, z) -> (x, -z, y).
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
    return oriented


def normalize_to_height(mesh: trimesh.Trimesh, target_height_mm: float) -> tuple[trimesh.Trimesh, float]:
    normalized = mesh.copy()
    source_height = float(normalized.extents[2])
    if not math.isfinite(source_height) or source_height <= 0:
        raise ValueError(f"Source height must be positive; got {source_height!r}")
    scale_factor = target_height_mm / source_height
    normalized.apply_scale(scale_factor)
    bounds = normalized.bounds
    xy_center = (bounds[0, :2] + bounds[1, :2]) / 2.0
    normalized.apply_translation([-xy_center[0], -xy_center[1], -bounds[0, 2]])
    normalized.units = "mm"
    return normalized, float(scale_factor)


def clean_mesh(mesh: trimesh.Trimesh) -> dict[str, Any]:
    before = mesh_summary(mesh)
    cleaned = mesh.copy()
    cleaned.remove_infinite_values()
    if hasattr(cleaned, "nondegenerate_faces"):
        cleaned.update_faces(cleaned.nondegenerate_faces())
    elif hasattr(cleaned, "remove_degenerate_faces"):
        cleaned.remove_degenerate_faces()
    cleaned.remove_unreferenced_vertices()
    cleaned.merge_vertices()
    cleaned.remove_unreferenced_vertices()
    cleaned.units = "mm"
    return {
        "mesh": cleaned,
        "before": before,
        "after": mesh_summary(cleaned),
    }


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
    issues = edge_issue_counts(mesh)
    return {
        "bounds": mesh.bounds.tolist(),
        "extents": mesh.extents.tolist(),
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "is_watertight": bool(mesh.is_watertight),
        "is_volume": bool(mesh.is_volume),
        "volume": float(mesh.volume) if mesh.is_volume else None,
        "degenerate_faces": degenerate_face_count(mesh),
        **issues,
    }


def mesh_for_glb_export(print_mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    glb_mesh = print_mesh.copy()
    # Print mesh is Z-up. glTF files are Y-up. Map (x, y, z) -> (x, z, -y)
    # so Blender/Three importers display the model with the same print extents.
    transform = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, -1.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        dtype=float,
    )
    glb_mesh.apply_transform(transform)
    return glb_mesh


def export_mesh(mesh: trimesh.Trimesh, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(path)
    return path.stat().st_size


def main() -> None:
    args = parse_args()
    source_path = Path(args.source).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    source_up_axis = resolve_source_up_axis(source_path, args.source_up_axis)
    target_reference = None
    if args.target_height_mm is not None:
        target_height_mm = float(args.target_height_mm)
    elif args.reference_3mf:
        target_reference = load_reference_height_mm(Path(args.reference_3mf).resolve())
        target_height_mm = target_reference["height_mm"]
    else:
        raise ValueError("Provide either --target-height-mm or --reference-3mf.")

    source_mesh = load_scene_or_mesh(source_path)
    oriented_mesh = orient_to_print_z_up(source_mesh, source_up_axis)
    normalized_mesh, scale_factor = normalize_to_height(oriented_mesh, target_height_mm)
    cleanup = None
    final_mesh = normalized_mesh
    if not args.skip_basic_cleanup:
        cleanup = clean_mesh(normalized_mesh)
        final_mesh = cleanup["mesh"]

    files = {
        "stl": output_dir / "model.normalized.stl",
        "3mf": output_dir / "model.normalized.3mf",
        "glb": output_dir / "model.normalized.glb",
    }
    exported = {
        "stl": export_mesh(final_mesh, files["stl"]),
        "3mf": export_mesh(final_mesh, files["3mf"]),
        "glb": export_mesh(mesh_for_glb_export(final_mesh), files["glb"]),
    }

    metadata = {
        "postprocess_id": "meshy-normalize-artifact-v1",
        "source_model": str(source_path),
        "source_format": source_path.suffix.lower().lstrip("."),
        "source_up_axis": source_up_axis,
        "target_reference": target_reference,
        "target_height_mm": target_height_mm,
        "scale_factor": scale_factor,
        "units": "mm",
        "source_mesh_before_orientation": mesh_summary(source_mesh),
        "source_mesh_after_orientation": mesh_summary(oriented_mesh),
        "normalized_mesh_before_cleanup": mesh_summary(normalized_mesh),
        "cleanup": None if cleanup is None else {"before": cleanup["before"], "after": cleanup["after"]},
        "normalized_mesh": mesh_summary(final_mesh),
        "exported_files": {
            name: {"path": str(path), "size_bytes": exported[name]} for name, path in files.items()
        },
        "notes": [
            "Scale normalization does not guarantee printability; inherited Meshy topology defects may remain.",
            "GLB is converted from print Z-up coordinates back to glTF Y-up coordinates for preview importers.",
        ],
    }

    metadata_path = output_dir / "normalization.metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(output_dir), **metadata}, indent=2))


if __name__ == "__main__":
    main()
