import io

import numpy as np
from PIL import Image

from app.depth import (
    ContinuousLuminanceDepthProvider,
    DepthAnythingV2SmallDepthProvider,
    LithophaneBaselineDepthProvider,
    LuminanceDepthProvider,
    heightmap_to_image_bytes,
)


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

    assert _mean_adjacent_delta(heightmap.values) < _mean_adjacent_delta(raw_heights) * 0.25
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

    def fake_infer_depth_anything_v2_small(_image: Image.Image) -> np.ndarray:
        return np.array(
            [
                [0.0, 0.5, 1.0],
                [0.0, 0.5, 1.0],
            ],
            dtype=np.float32,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small",
        fake_infer_depth_anything_v2_small,
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


def test_sam_masked_depth_raises_subject_above_background(monkeypatch) -> None:
    """Subject region (center) should have higher relief than background (edges)."""
    image = Image.new("RGB", (6, 6), "white")

    def fake_infer_depth(img: Image.Image) -> np.ndarray:
        # Gradient depth: values increase toward bottom-right
        # This gives _normalize_depth a real range to work with
        row = np.linspace(0.1, 0.9, 6, dtype=np.float32)
        return np.tile(row, (6, 1))

    def fake_generate_mask(img: Image.Image, *, blur_radius_px: float = 5.0) -> np.ndarray:
        # Center 4x4 is subject (1.0), edges are background (0.0)
        mask = np.zeros((6, 6), dtype=np.float32)
        mask[1:5, 1:5] = 1.0
        return mask

    monkeypatch.setattr("app.depth._infer_depth_anything_v2_small", fake_infer_depth)
    monkeypatch.setattr("app.depth._generate_subject_mask", fake_generate_mask)

    from app.depth import SamMaskedDepthProvider

    heightmap = SamMaskedDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    # Compare same-column subject vs background to isolate mask effect
    # Column 3 has the same raw depth for row 0 (background) and row 2 (subject)
    subject_mean = float(np.mean(heightmap.values[1:5, 1:5]))
    background_mean = float(np.mean(heightmap.values[0, :]))
    assert subject_mean > background_mean, (
        f"Subject ({subject_mean:.3f}) should be higher than background ({background_mean:.3f})"
    )
    assert heightmap.provider == "sam_masked_depth"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def _mean_adjacent_delta(values: np.ndarray) -> float:
    vertical = np.mean(np.abs(np.diff(values, axis=0)))
    horizontal = np.mean(np.abs(np.diff(values, axis=1)))
    return float(vertical + horizontal)


def test_triposr_sidecar_projects_mesh_depth_to_relief(monkeypatch) -> None:
    """TripoSR provider should project a 3D mesh into a depth map and produce valid relief."""
    image = Image.new("RGB", (4, 4), "white")

    # Fake Tripo API inference — returns a dummy object (the test monkeypatches
    # _project_mesh_to_depth too, so the mesh object is never actually used)
    def fake_infer_triposr_api(_image: Image.Image) -> object:
        return object()  # placeholder mesh

    # Fake depth projection — returns a gradient depth map
    def fake_project_mesh_to_depth(
        _mesh: object, width_px: int, height_px: int
    ) -> np.ndarray:
        row = np.linspace(0.1, 0.9, width_px, dtype=np.float32)
        return np.tile(row, (height_px, 1))

    monkeypatch.setattr("app.depth._infer_triposr_api", fake_infer_triposr_api)
    monkeypatch.setattr("app.depth._project_mesh_to_depth", fake_project_mesh_to_depth)

    from app.depth import TripoSRSidecarProvider

    heightmap = TripoSRSidecarProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    # Right side (higher depth) should produce more relief than left side
    assert heightmap.values[0, -1] > heightmap.values[0, 0]
    assert heightmap.provider == "triposr_sidecar"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2
