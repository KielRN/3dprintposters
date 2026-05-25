#!/usr/bin/env python
"""Add a deterministic PrintU-style round base to a Meshy STL output.

This is intentionally an experiment helper, not production fulfillment code.
It keeps user-custom text out of Meshy's generative step and adds stable local
geometry after the provider model has been downloaded.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Input Meshy STL path.")
    parser.add_argument("--output-dir", required=True, help="Directory for postprocessed assets.")
    parser.add_argument(
        "--base-style",
        default="printu-star",
        choices=["printu-star"],
        help="Deterministic base style to add.",
    )
    parser.add_argument(
        "--segments",
        type=int,
        default=128,
        help="Circular base segment count. Default: 128.",
    )
    return parser.parse_args()


def load_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="mesh")
    if isinstance(loaded, trimesh.Scene):
        loaded = loaded.dump(concatenate=True)
    if not isinstance(loaded, trimesh.Trimesh):
        raise TypeError(f"Unsupported mesh type from {path}: {type(loaded)!r}")
    if loaded.vertices.size == 0 or loaded.faces.size == 0:
        raise ValueError(f"Input mesh is empty: {path}")
    return loaded


def center_and_lift_model(mesh: trimesh.Trimesh, base_height: float) -> trimesh.Trimesh:
    centered = mesh.copy()
    bounds = centered.bounds
    xy_center = (bounds[0, :2] + bounds[1, :2]) / 2.0
    z_offset = base_height - bounds[0, 2]
    centered.apply_translation([-xy_center[0], -xy_center[1], z_offset])
    centered.visual.vertex_colors = np.tile(
        np.array([[55, 55, 55, 255]], dtype=np.uint8),
        (len(centered.vertices), 1),
    )
    return centered


def circular_layers(radius: float, height: float) -> list[tuple[float, float]]:
    return [
        (0.0, radius * 0.88),
        (height * 0.12, radius),
        (height * 0.76, radius),
        (height * 0.92, radius * 0.96),
        (height, radius * 0.88),
    ]


def make_beveled_round_base(radius: float, height: float, segments: int) -> trimesh.Trimesh:
    vertices: list[list[float]] = []
    faces: list[list[int]] = []
    layers = circular_layers(radius, height)

    for z, layer_radius in layers:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            vertices.append(
                [layer_radius * math.cos(angle), layer_radius * math.sin(angle), z],
            )

    for layer_index in range(len(layers) - 1):
        ring_a = layer_index * segments
        ring_b = (layer_index + 1) * segments
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append([ring_a + index, ring_a + next_index, ring_b + next_index])
            faces.append([ring_a + index, ring_b + next_index, ring_b + index])

    bottom_center = len(vertices)
    vertices.append([0.0, 0.0, 0.0])
    top_center = len(vertices)
    vertices.append([0.0, 0.0, height])
    top_ring = (len(layers) - 1) * segments

    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append([bottom_center, next_index, index])
        faces.append([top_center, top_ring + index, top_ring + next_index])

    base = trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=True)
    base.visual.vertex_colors = np.tile(
        np.array([[178, 178, 178, 255]], dtype=np.uint8),
        (len(base.vertices), 1),
    )
    return base


def star_points(outer_radius: float, inner_radius: float) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    start_angle = math.pi / 2.0
    for index in range(10):
        radius = outer_radius if index % 2 == 0 else inner_radius
        angle = start_angle + index * math.pi / 5.0
        points.append((radius * math.cos(angle), radius * math.sin(angle)))
    return points


def make_raised_star(radius: float, z_bottom: float, height: float) -> trimesh.Trimesh:
    points = star_points(outer_radius=radius, inner_radius=radius * 0.42)
    vertices: list[list[float]] = [[0.0, 0.0, z_bottom], [0.0, 0.0, z_bottom + height]]

    for x, y in points:
        vertices.append([x, y, z_bottom])
    for x, y in points:
        vertices.append([x, y, z_bottom + height])

    faces: list[list[int]] = []
    bottom_center = 0
    top_center = 1
    bottom_start = 2
    top_start = 2 + len(points)
    count = len(points)

    for index in range(count):
        next_index = (index + 1) % count
        b0 = bottom_start + index
        b1 = bottom_start + next_index
        t0 = top_start + index
        t1 = top_start + next_index
        faces.append([bottom_center, b1, b0])
        faces.append([top_center, t0, t1])
        faces.append([b0, b1, t1])
        faces.append([b0, t1, t0])

    star = trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=True)
    star.visual.vertex_colors = np.tile(
        np.array([[205, 205, 205, 255]], dtype=np.uint8),
        (len(star.vertices), 1),
    )
    return star


def with_units(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh.units = "mm"
    return mesh


def mesh_summary(mesh: trimesh.Trimesh) -> dict[str, Any]:
    return {
        "bounds": mesh.bounds.tolist(),
        "extents": mesh.extents.tolist(),
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "is_watertight": bool(mesh.is_watertight),
        "volume": float(mesh.volume) if mesh.is_volume else None,
    }


def export_mesh(mesh: trimesh.Trimesh, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(path)
    return path.stat().st_size


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    source = load_mesh(input_path)
    source_bounds = source.bounds.copy()
    source_extents = source.extents
    figure_height = float(source_extents[2])
    footprint = float(max(source_extents[0], source_extents[1]))

    base_radius = max(footprint * 0.72, figure_height * 0.25)
    base_height = figure_height * 0.11
    star_radius = base_radius * 0.56
    star_height = max(figure_height * 0.018, base_height * 0.16)

    figure = center_and_lift_model(source, base_height)
    base = make_beveled_round_base(base_radius, base_height, max(args.segments, 32))
    star = make_raised_star(star_radius, base_height, star_height)

    combined = trimesh.util.concatenate([figure, base, star])
    with_units(combined)
    with_units(base)
    with_units(star)

    files = {
        "stl": output_dir / "model-with-printu-star-base.stl",
        "glb": output_dir / "model-with-printu-star-base.glb",
        "3mf": output_dir / "model-with-printu-star-base.3mf",
        "base_stl": output_dir / "printu-star-base-only.stl",
    }

    exported = {name: export_mesh(combined if name != "base_stl" else base, path) for name, path in files.items()}

    metadata = {
        "postprocess_id": "deterministic-printu-star-base-v1",
        "source_model": str(input_path),
        "base_style": args.base_style,
        "units": "mm",
        "base": {
            "radius": base_radius,
            "diameter": base_radius * 2.0,
            "height": base_height,
            "segments": max(args.segments, 32),
            "star_radius": star_radius,
            "star_height": star_height,
            "star_placement": "raised_on_top_center",
        },
        "source_mesh_before_transform": {
            "bounds": source_bounds.tolist(),
            "extents": source_extents.tolist(),
            "vertex_count": int(len(source.vertices)),
            "face_count": int(len(source.faces)),
            "is_watertight": bool(source.is_watertight),
        },
        "figure_after_transform": mesh_summary(figure),
        "base_mesh": mesh_summary(base),
        "star_mesh": mesh_summary(star),
        "combined_mesh": mesh_summary(combined),
        "exported_files": {name: {"path": str(path), "size_bytes": exported[name]} for name, path in files.items()},
        "notes": [
            "The deterministic base is added after Meshy; Meshy is not asked to preserve text or base details.",
            "The combined mesh intentionally does not repair the Meshy figurine body.",
            "The raised star is deterministic geometry, not texture.",
        ],
    }

    metadata_path = output_dir / "postprocess.metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(output_dir), **metadata}, indent=2))


if __name__ == "__main__":
    main()
