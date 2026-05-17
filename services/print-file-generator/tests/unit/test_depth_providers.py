import io

import numpy as np
from PIL import Image

from app.depth import (
    ContinuousLuminanceDepthProvider,
    DepthAnythingV2SmallDepthProvider,
    DepthInferenceResult,
    LithophaneBaselineDepthProvider,
    LuminanceDepthProvider,
    heightmap_to_image_bytes,
)
from app.providers.base import ProviderAudit
from tests.support import mean_adjacent_delta


def test_posterized_luminance_suppresses_high_frequency_texture() -> None:
    base = np.full((64, 64), 180, dtype=np.uint8)
    base[24:40, 24:40] = 40
    texture = (((np.indices((64, 64)).sum(axis=0) % 2) * 2 - 1) * 30).astype(
        np.int16
    )
    source = np.clip(base.astype(np.int16) + texture, 0, 255).astype(np.uint8)
    image = Image.fromarray(source).convert("RGB")

    heightmap = LuminanceDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
    )
    raw_heights = 1.2 + 0.4 + (1.0 - source.astype(np.float32) / 255.0) * 2.6

    assert mean_adjacent_delta(heightmap.values) < mean_adjacent_delta(raw_heights) * 0.25
    assert heightmap.provider == "posterized_luminance"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def test_continuous_luminance_keeps_more_than_posterized_bands() -> None:
    source = np.tile(np.linspace(0, 255, 64, dtype=np.uint8), (64, 1))
    image = Image.fromarray(source).convert("RGB")

    heightmap = ContinuousLuminanceDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
    )

    unique_rounded_heights = np.unique(np.round(heightmap.values, 3))
    assert len(unique_rounded_heights) > 16
    assert heightmap.provider == "continuous_luminance"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def test_lithophane_baseline_maps_dark_pixels_to_more_thickness() -> None:
    image = Image.new("RGB", (2, 2))
    image.putdata(
        [
            (0, 0, 0),
            (255, 255, 255),
            (0, 0, 0),
            (255, 255, 255),
        ]
    )

    heightmap = LithophaneBaselineDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    assert heightmap.values[0, 0] > heightmap.values[0, 1]
    assert heightmap.provider == "lithophane_baseline"


def test_depth_anything_v2_small_maps_relative_depth_to_relief(monkeypatch) -> None:
    image = Image.new("RGB", (3, 2), "white")

    def fake_infer_depth_anything_v2_small_result(
        _image: Image.Image,
    ) -> DepthInferenceResult:
        return DepthInferenceResult(
            depth=np.array(
                [
                    [0.0, 0.5, 1.0],
                    [0.0, 0.5, 1.0],
                ],
                dtype=np.float32,
            ),
            audit=ProviderAudit(
                succeeded="stub-depth",
                model_version="stub:v1",
            ),
        )

    monkeypatch.setattr(
        "app.depth_providers._infer_depth_anything_v2_small_result",
        fake_infer_depth_anything_v2_small_result,
    )

    heightmap = DepthAnythingV2SmallDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    assert heightmap.values[0, 2] > heightmap.values[0, 0]
    assert heightmap.provider == "depth_anything_v2_small"
    assert heightmap.provider_audit == {
        "monocular_depth": {
            "succeeded": "stub-depth",
            "attempted": [],
            "model_version": "stub:v1",
        }
    }
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def test_heightmap_png_can_export_16_bit() -> None:
    image = Image.fromarray(np.array([[0, 255]], dtype=np.uint8)).convert("RGB")
    heightmap = ContinuousLuminanceDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    exported = Image.open(io.BytesIO(heightmap_to_image_bytes(heightmap, bit_depth=16)))

    assert exported.mode in {"I;16", "I"}
    assert exported.size == (2, 1)


def test_triposr_sidecar_projects_mesh_depth_to_relief(monkeypatch) -> None:
    image = Image.new("RGB", (4, 4), "white")

    def fake_infer_triposr_api(_image: Image.Image) -> object:
        return object()

    def fake_project_mesh_to_depth(
        _mesh: object, width_px: int, height_px: int
    ) -> np.ndarray:
        row = np.linspace(0.1, 0.9, width_px, dtype=np.float32)
        return np.tile(row, (height_px, 1))

    monkeypatch.setattr(
        "app.experimental.triposr_sidecar._infer_triposr_api",
        fake_infer_triposr_api,
    )
    monkeypatch.setattr(
        "app.experimental.triposr_sidecar._project_mesh_to_depth",
        fake_project_mesh_to_depth,
    )

    from app.depth import TripoSRSidecarProvider

    heightmap = TripoSRSidecarProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    assert heightmap.values[0, -1] > heightmap.values[0, 0]
    assert heightmap.provider == "triposr_sidecar"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2
