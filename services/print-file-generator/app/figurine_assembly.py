"""Deterministic assembly of provider figurine bodies onto named bases."""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np

from .models import FigurineAssemblyRequest
from .storage import StorageAdapter, artifact_path

DEFAULT_BODY_BASE_SEATING_OVERLAP_MM = 1.0
CONTACT_SEARCH_HEIGHT_FRACTION = 0.25
CONTACT_SEARCH_HEIGHT_MAX_MM = 30.0
CONTACT_Z_BIN_MM = 0.05
CONTACT_MIN_FOOTPRINT_FRACTION = 0.01
CONTACT_MIN_FOOTPRINT_MM2 = 4.0


def _vector3(values: np.ndarray) -> dict[str, float]:
    return {
        "x": float(values[0]),
        "y": float(values[1]),
        "z": float(values[2]),
    }


def _bounds_dict(bounds: np.ndarray) -> dict[str, dict[str, float]]:
    return {
        "min": _vector3(bounds[0]),
        "max": _vector3(bounds[1]),
    }


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_mesh(path: Path):
    import trimesh

    loaded = trimesh.load(path, force=None)
    if isinstance(loaded, trimesh.Scene):
        mesh = loaded.to_geometry()
        if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
            raise ValueError(f"No mesh geometry found in {path.name}.")
        return mesh
    if isinstance(loaded, trimesh.Trimesh) and len(loaded.faces) > 0:
        return loaded
    raise ValueError(f"No mesh geometry found in {path.name}.")


def _load_base_manifest(base_id: str) -> dict:
    assets_root = Path(__file__).resolve().parents[1] / "assets" / "figurine-bases"
    manifest_path = assets_root / base_id / "base.manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Unknown figurine base asset: {base_id}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _xy_footprint_area(points: np.ndarray) -> float:
    if len(points) < 3:
        return 0.0
    extents = np.ptp(points[:, :2], axis=0)
    return float(max(extents[0], 0.0) * max(extents[1], 0.0))


def _placement_contact_z(body_mesh) -> dict[str, float | str]:
    vertices = np.asarray(body_mesh.vertices, dtype=float)
    if vertices.size == 0:
        raise ValueError("Body GLB has no vertices to place on the base.")

    bounds = body_mesh.bounds
    min_z = float(bounds[0][2])
    max_z = float(bounds[1][2])
    height = max_z - min_z
    if height <= 0:
        raise ValueError("Body GLB has no measurable upright height.")

    body_footprint_area = _xy_footprint_area(vertices)
    min_required_area = max(
        CONTACT_MIN_FOOTPRINT_MM2,
        body_footprint_area * CONTACT_MIN_FOOTPRINT_FRACTION,
    )
    z_values = vertices[:, 2]
    epsilon = max(CONTACT_Z_BIN_MM, height * 0.0001)

    bottom_points = vertices[z_values <= min_z + epsilon]
    bottom_area = _xy_footprint_area(bottom_points)
    if bottom_area >= min_required_area:
        return {
            "contactZMm": min_z,
            "method": "lowest_bounds_broad_footprint",
            "footprintAreaMm2": bottom_area,
            "minimumFootprintAreaMm2": min_required_area,
            "ignoredLowerGeometryMm": 0.0,
        }

    search_height = min(
        max(height * CONTACT_SEARCH_HEIGHT_FRACTION, 8.0),
        CONTACT_SEARCH_HEIGHT_MAX_MM,
    )
    search_top = min(max_z, min_z + search_height)
    candidate_z = z_values[(z_values >= min_z) & (z_values <= search_top)]
    thresholds = np.unique(
        np.round(candidate_z / CONTACT_Z_BIN_MM) * CONTACT_Z_BIN_MM
    )
    for threshold in np.sort(thresholds):
        candidate_points = vertices[z_values <= threshold + epsilon]
        candidate_area = _xy_footprint_area(candidate_points)
        if candidate_area >= min_required_area:
            contact_z = float(max(threshold, min_z))
            return {
                "contactZMm": contact_z,
                "method": "lowest_broad_footprint",
                "footprintAreaMm2": candidate_area,
                "minimumFootprintAreaMm2": min_required_area,
                "ignoredLowerGeometryMm": max(contact_z - min_z, 0.0),
            }

    return {
        "contactZMm": min_z,
        "method": "fallback_lowest_bounds",
        "footprintAreaMm2": bottom_area,
        "minimumFootprintAreaMm2": min_required_area,
        "ignoredLowerGeometryMm": 0.0,
    }


def _body_to_z_up(body_mesh):
    """Rotate the likely up axis to Z using the largest body extent."""
    import trimesh

    extents = body_mesh.extents
    up_axis = int(np.argmax(extents))
    rotations = {
        0: trimesh.transformations.rotation_matrix(-np.pi / 2.0, [0.0, 1.0, 0.0]),
        1: trimesh.transformations.rotation_matrix(np.pi / 2.0, [1.0, 0.0, 0.0]),
        2: np.eye(4),
    }
    oriented = body_mesh.copy()
    oriented.apply_transform(rotations[up_axis])
    return oriented, ["x", "y", "z"][up_axis]


def _foot_zone_center_xy(manifest: dict, base_mesh) -> np.ndarray:
    zone = manifest.get("placementZones", {}).get("footPlacementZone")
    center = zone.get("centerMm") if isinstance(zone, dict) else None
    if isinstance(center, list) and len(center) >= 2:
        return np.array([float(center[0]), float(center[1])], dtype=float)

    bounds = base_mesh.bounds
    return np.array(
        [
            (float(bounds[0][0]) + float(bounds[1][0])) / 2.0,
            (float(bounds[0][1]) + float(bounds[1][1])) / 2.0,
        ],
        dtype=float,
    )


def _top_plane_z(manifest: dict, base_mesh) -> float:
    configured = manifest.get("placementZones", {}).get("topPlaneZMm")
    return float(configured) if configured is not None else float(base_mesh.bounds[1][2])


def _body_base_seating_overlap_mm(manifest: dict) -> float:
    configured = manifest.get("placementZones", {}).get("bodyBaseSeatingOverlapMm")
    if configured is None:
        return DEFAULT_BODY_BASE_SEATING_OVERLAP_MM
    return max(float(configured), 0.0)


def assemble_figurine_package(
    request: FigurineAssemblyRequest,
    *,
    storage: StorageAdapter,
) -> dict:
    import trimesh

    source_glb_bytes = storage.read_bytes(request.source_preview_glb_path)
    named_base_bytes = storage.read_bytes(request.named_base_stl_path)
    manifest = _load_base_manifest(request.base_id)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        source_glb_path = tmp_dir / "source-creative-lab.glb"
        named_base_path = tmp_dir / "source-named-base.stl"
        source_glb_path.write_bytes(source_glb_bytes)
        named_base_path.write_bytes(named_base_bytes)

        body_raw = _load_mesh(source_glb_path)
        named_base = _load_mesh(named_base_path)
        body, detected_up_axis = _body_to_z_up(body_raw)

        body_height_before_scale = float(body.extents[2])
        if body_height_before_scale <= 0:
            raise ValueError("Body GLB has no measurable upright height.")

        scale_factor = request.target_body_height_mm / body_height_before_scale
        body.apply_scale(scale_factor)

        body_bounds = body.bounds
        body_center_xy = np.array(
            [
                (float(body_bounds[0][0]) + float(body_bounds[1][0])) / 2.0,
                (float(body_bounds[0][1]) + float(body_bounds[1][1])) / 2.0,
            ],
            dtype=float,
        )
        target_center_xy = _foot_zone_center_xy(manifest, named_base)
        top_z = _top_plane_z(manifest, named_base)
        seating_overlap_mm = _body_base_seating_overlap_mm(manifest)
        placement_contact = _placement_contact_z(body)
        target_contact_z = top_z - seating_overlap_mm
        body.apply_translation(
            [
                float(target_center_xy[0] - body_center_xy[0]),
                float(target_center_xy[1] - body_center_xy[1]),
                float(target_contact_z - placement_contact["contactZMm"]),
            ]
        )

        assembled = trimesh.util.concatenate([named_base, body])
        out_dir = tmp_dir / "out"
        out_dir.mkdir()
        artifact_files = {
            "assembledPreviewGlb": "assembled-preview.glb",
            "assembledStl": "assembled.stl",
            "assembled3mf": "assembled.3mf",
            "sourcePreviewGlb": "sources/source-creative-lab.glb",
            "sourceNamedBaseStl": "sources/source-named-base.stl",
        }
        (out_dir / "sources").mkdir()
        assembled.export(out_dir / artifact_files["assembledPreviewGlb"])
        assembled.export(out_dir / artifact_files["assembledStl"])
        assembled.export(out_dir / artifact_files["assembled3mf"])
        (out_dir / artifact_files["sourcePreviewGlb"]).write_bytes(source_glb_bytes)
        (out_dir / artifact_files["sourceNamedBaseStl"]).write_bytes(named_base_bytes)

        metrics = {
            "targetBodyHeightMm": float(request.target_body_height_mm),
            "bodyHeightBeforeScaleMm": body_height_before_scale,
            "scaleFactor": float(scale_factor),
            "detectedSourceUpAxis": detected_up_axis,
            "baseTopPlaneZMm": top_z,
            "bodyBaseSeatingOverlapMm": seating_overlap_mm,
            "bodyPlacementContact": {
                **placement_contact,
                "targetContactZMm": target_contact_z,
            },
            "targetFootCenterMm": {
                "x": float(target_center_xy[0]),
                "y": float(target_center_xy[1]),
            },
            "bodyBoundsMm": _bounds_dict(body.bounds),
            "baseBoundsMm": _bounds_dict(named_base.bounds),
            "assembledBoundsMm": _bounds_dict(assembled.bounds),
            "assembledExtentsMm": _vector3(assembled.extents),
            "faceCounts": {
                "body": int(len(body.faces)),
                "namedBase": int(len(named_base.faces)),
                "assembled": int(len(assembled.faces)),
            },
            "watertight": {
                "body": bool(body.is_watertight),
                "namedBase": bool(named_base.is_watertight),
                "assembled": bool(assembled.is_watertight),
            },
        }
        warnings = []
        if not body.is_watertight:
            warnings.append(
                "Provider body mesh is not watertight; downstream Meshy repair/remesh and slicer review are still required."
            )
        if not assembled.is_watertight:
            warnings.append(
                "Assembled package is not watertight before downstream print tooling."
            )
        if float(placement_contact["ignoredLowerGeometryMm"]) > max(
            seating_overlap_mm * 2.0,
            2.0,
        ):
            warnings.append(
                "Provider mesh includes isolated lower geometry below the support footprint; the broader contact plane was seated into the base."
            )

        checksums = {
            key: _sha256((out_dir / filename).read_bytes())
            for key, filename in artifact_files.items()
        }
        metadata = {
            "jobId": request.job_id,
            "uid": request.uid,
            "assemblyId": Path(request.output_prefix.rstrip("/")).name,
            "baseId": request.base_id,
            "sourcePreviewGlb": request.source_preview_glb_path,
            "namedBaseStl": request.named_base_stl_path,
            "namedBaseRevision": request.named_base_revision,
            "coordinateSystem": "millimeter_z_up",
            "assemblyPolicy": "support_plane_overlap_to_base_top_plane_v2",
            "metrics": metrics,
            "warnings": warnings,
            "artifacts": artifact_files,
            "checksums": checksums,
        }
        metadata_path = out_dir / "metadata.json"
        metadata_path.write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        content_types = {
            "assembled-preview.glb": "model/gltf-binary",
            "assembled.stl": "model/stl",
            "assembled.3mf": "model/3mf",
            "metadata.json": "application/json",
            "source-creative-lab.glb": "model/gltf-binary",
            "source-named-base.stl": "model/stl",
        }
        artifact_paths: dict[str, str] = {}
        for key, filename in {**artifact_files, "metadata": "metadata.json"}.items():
            target = artifact_path(request.output_prefix, filename)
            storage.write_bytes(
                target,
                (out_dir / filename).read_bytes(),
                content_type=content_types.get(
                    Path(filename).name,
                    "application/octet-stream",
                ),
            )
            artifact_paths[key] = target

    return {
        "job_id": request.job_id,
        "status": "assembled",
        "assembly_id": Path(request.output_prefix.rstrip("/")).name,
        "base_id": request.base_id,
        "source_preview_glb": request.source_preview_glb_path,
        "named_base_revision": request.named_base_revision,
        "artifact_paths": artifact_paths,
        "metrics": metrics,
        "warnings": warnings,
    }
