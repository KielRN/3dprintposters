"""Deterministic customer-name geometry for figurine bases.

Generates raised name lettering on a base asset's front name panel and unions
it into a single watertight printable mesh. Providers (Meshy) never see or
generate text; this module is the deterministic server-side replacement for
the garbled provider lettering observed in Experiment 002 B.

The base asset directory must contain `base.stl` (millimeters, Z-up) and
`base.manifest.json` with a `placementZones.nameTextZone` block describing the
name panel plane (see `scripts/promote_square_base_asset.py`).
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

MAX_NAME_CHARACTERS = 12
ALLOWED_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'\-]*$")
TARGET_CAP_HEIGHT_MM = 10.0
MIN_CAP_HEIGHT_MM = 4.0
# Horizontal glyph condensing so DejaVu Bold matches the narrower approved
# sample lettering proportions and longer names keep a readable cap height.
TEXT_X_CONDENSE = 0.8
FONT_FAMILY = "DejaVu Sans"
FONT_WEIGHT = "bold"


class NameValidationError(ValueError):
    """Raised when a customer sign name fails validation."""


@dataclass
class NamePanel:
    normal: np.ndarray
    in_plane_right: np.ndarray
    in_plane_up: np.ndarray
    panel_offset: float
    rect_x_min: float
    rect_x_max: float
    rect_z_min: float
    rect_z_max: float
    margin_mm: float
    default_center_z: float
    proud_of_panel_mm: float
    embedded_behind_panel_mm: float

    @classmethod
    def from_manifest(cls, manifest: dict) -> "NamePanel":
        zone = manifest["placementZones"]["nameTextZone"]
        plane = zone["plane"]
        rect = zone["panelRectWorldMm"]
        style = zone["approvedSampleStyle"]
        return cls(
            normal=np.array(plane["normal"], dtype=float),
            in_plane_right=np.array(plane["inPlaneRight"], dtype=float),
            in_plane_up=np.array(plane["inPlaneUp"], dtype=float),
            panel_offset=float(plane["recessedPanelOffset"]),
            rect_x_min=float(rect["xMinMm"]),
            rect_x_max=float(rect["xMaxMm"]),
            rect_z_min=float(rect["zMinMm"]),
            rect_z_max=float(rect["zMaxMm"]),
            margin_mm=float(zone["panelBoundsMm"].get("marginMm", 4.0)),
            default_center_z=float(zone["defaultTextCenterWorldZMm"]),
            proud_of_panel_mm=float(style["raisedProudOfPanelMm"]),
            embedded_behind_panel_mm=float(style["embeddedBehindPanelMm"]),
        )

    @property
    def max_text_width_mm(self) -> float:
        return (self.rect_x_max - self.rect_x_min) - 2.0 * self.margin_mm

    VERTICAL_CLEARANCE_MM = 1.5

    @property
    def max_text_height_in_plane_mm(self) -> float:
        world_z_span = (self.rect_z_max - self.rect_z_min) - 2.0 * self.VERTICAL_CLEARANCE_MM
        return world_z_span / abs(self.in_plane_up[2])


@dataclass
class NameGeometryResult:
    mesh: "object"  # trimesh.Trimesh
    metadata: dict = field(default_factory=dict)


def validate_sign_name(raw_name: str) -> str:
    """Validate and normalize a customer sign name.

    Rules (UI must mirror these): 1-12 characters after trimming and collapsing
    whitespace; letters, digits, spaces, hyphens, apostrophes, and periods only;
    must start with a letter or digit.
    """
    if not isinstance(raw_name, str):
        raise NameValidationError("Name must be text.")
    name = re.sub(r"\s+", " ", raw_name.strip())
    if not name:
        raise NameValidationError("Name is required.")
    if len(name) > MAX_NAME_CHARACTERS:
        raise NameValidationError(
            f"Name must be {MAX_NAME_CHARACTERS} characters or fewer."
        )
    if not ALLOWED_NAME_PATTERN.match(name):
        raise NameValidationError(
            "Name may only use letters, numbers, spaces, hyphens, "
            "apostrophes, and periods, and must start with a letter or number."
        )
    return name


def _font_properties():
    from matplotlib.font_manager import FontProperties, findfont

    properties = FontProperties(family=FONT_FAMILY, weight=FONT_WEIGHT)
    font_file = findfont(properties, fallback_to_default=False)
    return properties, font_file


def _text_polygons(name: str, properties) -> tuple[list[np.ndarray], float]:
    """Glyph outline rings for `name` plus the font cap height, both in font units."""
    from matplotlib.textpath import TextPath

    reference_size = 100.0
    cap = TextPath((0, 0), "H", size=reference_size, prop=properties)
    cap_height = float(cap.get_extents().ymax)
    rings = TextPath((0, 0), name, size=reference_size, prop=properties).to_polygons()
    if not rings:
        raise NameValidationError("Name produced no printable glyphs.")
    condensed = []
    for r in rings:
        arr = np.asarray(r, dtype=float).copy()
        arr[:, 0] *= TEXT_X_CONDENSE
        condensed.append(arr)
    return condensed, cap_height


def _rings_to_geometry(rings: list[np.ndarray]):
    """Even-odd combine outline rings into a shapely (Multi)Polygon."""
    from shapely.geometry import Polygon

    combined = None
    for ring in rings:
        if len(ring) < 3:
            continue
        polygon = Polygon(ring)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        combined = polygon if combined is None else combined.symmetric_difference(polygon)
    if combined is None or combined.is_empty:
        raise NameValidationError("Name produced no printable glyph area.")
    cleaned = combined.buffer(0)
    return combined if cleaned.is_empty else cleaned


def build_name_text_mesh(name: str, panel: NamePanel) -> NameGeometryResult:
    """Extruded, world-positioned raised lettering mesh for `name`."""
    import trimesh
    from shapely.geometry import MultiPolygon

    properties, font_file = _font_properties()
    rings, cap_height_units = _text_polygons(name, properties)
    geometry = _rings_to_geometry(rings)

    min_x, min_y, max_x, max_y = geometry.bounds
    width_units = max_x - min_x

    scale = TARGET_CAP_HEIGHT_MM / cap_height_units
    if width_units * scale > panel.max_text_width_mm:
        scale = panel.max_text_width_mm / width_units
    if (max_y - min_y) * scale > panel.max_text_height_in_plane_mm:
        scale = panel.max_text_height_in_plane_mm / (max_y - min_y)
    cap_height_mm = cap_height_units * scale
    if cap_height_mm < MIN_CAP_HEIGHT_MM:
        raise NameValidationError(
            "Name is too long to print legibly on the base. "
            f"Use {MAX_NAME_CHARACTERS} characters or fewer."
        )

    thickness = panel.embedded_behind_panel_mm + panel.proud_of_panel_mm
    polygons = (
        list(geometry.geoms) if isinstance(geometry, MultiPolygon) else [geometry]
    )
    prisms = []
    for polygon in polygons:
        prisms.append(trimesh.creation.extrude_polygon(polygon, height=thickness))
    text_mesh = trimesh.util.concatenate(prisms)

    # Center the lettering: x on the glyph bbox center, y on the cap-height box.
    text_mesh.apply_translation([-(min_x + max_x) / 2.0, 0.0, 0.0])
    scale_matrix = np.eye(4)
    scale_matrix[0, 0] = scale_matrix[1, 1] = scale
    text_mesh.apply_transform(scale_matrix)
    text_mesh.apply_translation([0.0, -cap_height_mm / 2.0, 0.0])

    # Local frame -> world: x->in_plane_right, y->in_plane_up, z->normal.
    # Extrusion starts embedded behind the panel.
    n = panel.normal / np.linalg.norm(panel.normal)
    u = panel.in_plane_right / np.linalg.norm(panel.in_plane_right)
    v = panel.in_plane_up / np.linalg.norm(panel.in_plane_up)
    center_z = panel.default_center_z
    # World origin: local (0,0,0) lands on the panel plane at x = 0,
    # world z = center_z, pulled back by the embed depth.
    plane_point_y = (panel.panel_offset - n[2] * center_z) / n[1]
    origin = np.array([0.0, plane_point_y, center_z]) - n * panel.embedded_behind_panel_mm

    world = np.eye(4)
    world[:3, 0] = u
    world[:3, 1] = v
    world[:3, 2] = n
    world[:3, 3] = origin
    text_mesh.apply_transform(world)

    metadata = {
        "name": name,
        "font": {
            "family": FONT_FAMILY,
            "weight": FONT_WEIGHT,
            "file": Path(font_file).name,
        },
        "capHeightMm": cap_height_mm,
        "textWidthMm": width_units * scale,
        "raisedProudOfPanelMm": panel.proud_of_panel_mm,
        "embeddedBehindPanelMm": panel.embedded_behind_panel_mm,
        "extrudeThicknessMm": thickness,
        "letterPrismCount": len(prisms),
    }
    return NameGeometryResult(mesh=text_mesh, metadata=metadata)


def load_base_asset(base_dir: Path):
    import trimesh

    manifest = json.loads((base_dir / "base.manifest.json").read_text(encoding="utf-8"))
    mesh = trimesh.load(base_dir / "base.stl", force="mesh")
    return mesh, manifest


def compose_named_base(base_dir: Path, raw_name: str) -> NameGeometryResult:
    """Union deterministic raised lettering into the base asset mesh."""
    import trimesh

    name = validate_sign_name(raw_name)
    base_mesh, manifest = load_base_asset(Path(base_dir))
    panel = NamePanel.from_manifest(manifest)
    text = build_name_text_mesh(name, panel)

    composed = trimesh.boolean.union([base_mesh, text.mesh], engine="manifold")
    if not composed.is_watertight:
        raise ValueError("Composed named base is not watertight.")

    text_bounds = text.mesh.bounds
    panel_x_lo = panel.rect_x_min + panel.margin_mm
    panel_x_hi = panel.rect_x_max - panel.margin_mm
    if text_bounds[0][0] < panel_x_lo - 0.01 or text_bounds[1][0] > panel_x_hi + 0.01:
        raise ValueError("Name lettering exceeds the base name panel bounds.")

    metadata = {
        "baseId": manifest["baseId"],
        "baseAssetVersion": manifest.get("assetVersion"),
        "units": "millimeter",
        "coordinateSystem": manifest.get("coordinateSystem"),
        "lettering": text.metadata,
        "composed": {
            "watertight": bool(composed.is_watertight),
            "faces": int(len(composed.faces)),
            "extentsMm": [float(x) for x in composed.extents],
            "boundsMm": [[float(x) for x in row] for row in composed.bounds],
        },
    }
    return NameGeometryResult(mesh=composed, metadata=metadata)


def export_named_base(
    base_dir: Path,
    raw_name: str,
    out_dir: Path,
    scale_contract_factor: float | None = None,
) -> dict:
    """Compose and export STL/3MF print files plus a raw-scale preview GLB."""
    import trimesh

    result = compose_named_base(base_dir, raw_name)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    artifacts: dict[str, str] = {}
    stl_path = out_dir / "named-base.stl"
    result.mesh.export(stl_path)
    artifacts["stl"] = stl_path.name

    threemf_path = out_dir / "named-base.3mf"
    result.mesh.export(threemf_path)
    artifacts["3mf"] = threemf_path.name

    manifest = json.loads(
        (Path(base_dir) / "base.manifest.json").read_text(encoding="utf-8")
    )
    factor = scale_contract_factor or (
        manifest.get("derivedFrom", {}).get("scaleContract", {}).get("factor")
    )
    if factor:
        preview = result.mesh.copy()
        preview.apply_scale(1.0 / float(factor))
        preview.apply_transform(
            trimesh.transformations.rotation_matrix(-np.pi / 2.0, [1.0, 0.0, 0.0])
        )
        glb_path = out_dir / "named-base-preview.glb"
        preview.export(glb_path)
        artifacts["previewGlb"] = glb_path.name
        result.metadata["previewGlbScale"] = "raw-meshy-scene-units-y-up"

    result.metadata["artifacts"] = artifacts
    result.metadata["checksums"] = {
        name: hashlib.sha256((out_dir / name).read_bytes()).hexdigest()
        for name in artifacts.values()
    }
    metadata_path = out_dir / "metadata.json"
    metadata_path.write_text(
        json.dumps(result.metadata, indent=2) + "\n", encoding="utf-8"
    )
    return result.metadata


def generate_named_base_bundle(request, storage) -> dict:
    """Service-level orchestration: compose, export, and upload artifacts.

    `request` is a FigurineNamedBaseRequest; `storage` is a StorageAdapter.
    Returns the response payload dict for FigurineNamedBaseResponse.
    """
    import tempfile

    assets_root = Path(__file__).resolve().parents[1] / "assets" / "figurine-bases"
    base_dir = assets_root / request.base_id
    if not (base_dir / "base.manifest.json").is_file():
        raise FileNotFoundError(f"Unknown figurine base asset: {request.base_id}")

    name = validate_sign_name(request.customer_name)

    content_types = {
        "named-base.stl": "model/stl",
        "named-base.3mf": "model/3mf",
        "named-base-preview.glb": "model/gltf-binary",
        "metadata.json": "application/json",
    }
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        metadata = export_named_base(base_dir, name, out_dir)
        prefix = request.output_prefix.rstrip("/")
        artifact_paths: dict[str, str] = {}
        for key, filename in {**metadata["artifacts"], "metadata": "metadata.json"}.items():
            target = f"{prefix}/{filename}"
            storage.write_bytes(
                target,
                (out_dir / filename).read_bytes(),
                content_type=content_types.get(filename, "application/octet-stream"),
            )
            artifact_paths[key] = target

    return {
        "job_id": request.job_id,
        "status": "succeeded",
        "base_id": request.base_id,
        "normalized_name": name,
        "artifact_paths": artifact_paths,
        "lettering": metadata["lettering"],
        "composed": metadata["composed"],
        "warnings": [],
    }
