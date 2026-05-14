import json
import struct

import numpy as np
import pytest
from PIL import Image

from app.depth import Heightmap
from app.models import PrintFileGenerationRequest
from app.printability import evaluate_printability
from app.preview import (
    BIN_CHUNK_TYPE,
    JSON_CHUNK_TYPE,
    color_preview_glb_bytes,
    neutral_preview_glb_bytes,
)
from app.relief import binary_stl_bytes, build_closed_relief_mesh


def test_closed_relief_mesh_has_top_bottom_and_sidewall_faces() -> None:
    heightmap = np.array(
        [
            [1.0, 2.0],
            [3.0, 4.0],
        ],
        dtype=np.float32,
    )

    mesh = build_closed_relief_mesh(heightmap, width_mm=127.0, height_mm=177.8)

    assert len(mesh.vertices) == 8
    assert len(mesh.faces) == 12
    assert mesh.width_mm == 127.0
    assert mesh.height_mm == 177.8
    assert mesh.min_z_mm == 0.0
    assert mesh.max_z_mm == 4.0

    stl_bytes = binary_stl_bytes(mesh)
    assert struct.unpack("<I", stl_bytes[80:84])[0] == len(mesh.faces)
    assert len(stl_bytes) == 84 + len(mesh.faces) * 50


def test_relief_mesh_maps_image_top_to_positive_y() -> None:
    heightmap = np.array(
        [
            [1.0, 2.0],
            [3.0, 4.0],
        ],
        dtype=np.float32,
    )

    mesh = build_closed_relief_mesh(heightmap, width_mm=10.0, height_mm=20.0)

    assert mesh.vertices[0] == (0.0, 0.0, 3.0)
    assert mesh.vertices[1] == (10.0, 0.0, 4.0)
    assert mesh.vertices[2] == (0.0, 20.0, 1.0)
    assert mesh.vertices[3] == (10.0, 20.0, 2.0)


def test_relief_mesh_adds_product_border_around_image_window() -> None:
    heightmap = np.array(
        [
            [1.6, 2.0],
            [3.0, 4.2],
        ],
        dtype=np.float32,
    )

    mesh = build_closed_relief_mesh(
        heightmap,
        width_mm=139.7,
        height_mm=190.5,
        image_window_width_mm=127.0,
        image_window_height_mm=177.8,
        border_mm=6.35,
        border_height_mm=1.2,
    )

    assert mesh.width_mm == 139.7
    assert mesh.height_mm == 190.5
    assert mesh.image_window_width_mm == 127.0
    assert mesh.image_window_height_mm == 177.8
    assert mesh.border_mm == 6.35
    assert len(mesh.vertices) == 32
    assert len(mesh.faces) == 60
    assert mesh.vertices[0] == (0.0, 0.0, 1.2)
    assert mesh.vertices[3] == (139.7, 0.0, 1.2)
    assert mesh.vertices[5] == (6.35, 6.35, 3.0)
    assert mesh.vertices[9] == pytest.approx((6.35, 184.15, 1.6))


def test_printability_checks_pass_for_closed_target_relief() -> None:
    heightmap = np.array(
        [
            [1.6, 2.0],
            [3.0, 4.2],
        ],
        dtype=np.float32,
    )
    mesh = build_closed_relief_mesh(
        heightmap,
        width_mm=139.7,
        height_mm=190.5,
        image_window_width_mm=127.0,
        image_window_height_mm=177.8,
        border_mm=6.35,
        border_height_mm=1.2,
    )
    stl_bytes = binary_stl_bytes(mesh)
    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="source.png",
        output_prefix="print-files/user_123/job_123",
    )

    report = evaluate_printability(
        request=request,
        mesh=mesh,
        heightmap=Heightmap(
            values=heightmap,
            min_height_mm=1.6,
            max_height_mm=4.2,
            provider="test",
        ),
        binary_stl_size=len(stl_bytes),
    )

    assert report.status == "passed"
    assert "physical_bounds_match_target" in report.checks
    assert "image_window_border_matches_target" in report.checks
    assert "mesh_is_watertight" in report.checks
    assert report.failures == []


def test_printability_checks_reject_open_mesh_edges() -> None:
    heightmap = np.array(
        [
            [1.6, 2.0],
            [3.0, 4.2],
        ],
        dtype=np.float32,
    )
    mesh = build_closed_relief_mesh(heightmap, width_mm=127.0, height_mm=177.8)
    open_mesh = type(mesh)(
        vertices=mesh.vertices,
        faces=mesh.faces[:-1],
        width_mm=mesh.width_mm,
        height_mm=mesh.height_mm,
        min_z_mm=mesh.min_z_mm,
        max_z_mm=mesh.max_z_mm,
    )
    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="source.png",
        output_prefix="print-files/user_123/job_123",
    )

    report = evaluate_printability(
        request=request,
        mesh=open_mesh,
        heightmap=Heightmap(
            values=heightmap,
            min_height_mm=1.6,
            max_height_mm=4.2,
            provider="test",
        ),
        binary_stl_size=len(binary_stl_bytes(mesh)),
    )

    assert report.status == "failed"
    assert any("open edges" in failure for failure in report.failures)


def test_neutral_preview_glb_contains_mesh_and_material() -> None:
    heightmap = np.array(
        [
            [1.0, 2.0],
            [3.0, 4.0],
        ],
        dtype=np.float32,
    )
    mesh = build_closed_relief_mesh(heightmap, width_mm=127.0, height_mm=177.8)

    glb_bytes = neutral_preview_glb_bytes(mesh)

    magic, version, total_length = struct.unpack("<4sII", glb_bytes[:12])
    assert magic == b"glTF"
    assert version == 2
    assert total_length == len(glb_bytes)

    json_length, json_type = struct.unpack("<II", glb_bytes[12:20])
    assert json_type == JSON_CHUNK_TYPE
    json_start = 20
    json_end = json_start + json_length
    gltf = json.loads(glb_bytes[json_start:json_end].decode("utf-8"))

    bin_length, bin_type = struct.unpack("<II", glb_bytes[json_end : json_end + 8])
    assert bin_type == BIN_CHUNK_TYPE
    assert gltf["asset"]["version"] == "2.0"
    assert gltf["accessors"][0]["count"] == len(mesh.vertices)
    assert gltf["accessors"][1]["count"] == len(mesh.faces) * 3
    assert gltf["buffers"][0]["byteLength"] == bin_length
    assert gltf["materials"][0]["name"] == "warm-neutral-preview"


def test_color_preview_glb_contains_image_vertex_colors() -> None:
    heightmap = np.array(
        [
            [1.0, 2.0],
            [3.0, 4.0],
        ],
        dtype=np.float32,
    )
    mesh = build_closed_relief_mesh(heightmap, width_mm=127.0, height_mm=177.8)
    image = Image.new("RGB", (2, 2))
    image.putdata(
        [
            (255, 0, 0),
            (0, 255, 0),
            (0, 0, 255),
            (255, 255, 255),
        ]
    )

    glb_bytes = color_preview_glb_bytes(mesh, image)

    magic, version, total_length = struct.unpack("<4sII", glb_bytes[:12])
    assert magic == b"glTF"
    assert version == 2
    assert total_length == len(glb_bytes)

    json_length, json_type = struct.unpack("<II", glb_bytes[12:20])
    assert json_type == JSON_CHUNK_TYPE
    json_start = 20
    json_end = json_start + json_length
    gltf = json.loads(glb_bytes[json_start:json_end].decode("utf-8"))

    bin_length, bin_type = struct.unpack("<II", glb_bytes[json_end : json_end + 8])
    assert bin_type == BIN_CHUNK_TYPE
    assert gltf["buffers"][0]["byteLength"] == bin_length
    primitive = gltf["meshes"][0]["primitives"][0]
    assert primitive["attributes"]["COLOR_0"] == 1
    assert primitive["indices"] == 2
    assert gltf["accessors"][1]["count"] == len(mesh.vertices)
    assert gltf["accessors"][1]["componentType"] == 5126
    assert gltf["materials"][0]["name"] == "image-color-preview"
