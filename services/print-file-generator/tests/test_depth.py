import io

import numpy as np
from PIL import Image

from app.depth import (
    ContinuousLuminanceDepthProvider,
    DepthAnythingV2SmallDepthProvider,
    LithophaneBaselineDepthProvider,
    LuminanceDepthProvider,
    _apply_bas_relief_transform,
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


def test_segformer_masked_depth_raises_subject_above_background(monkeypatch) -> None:
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

    from app.depth import SegformerMaskedDepthProvider

    heightmap = SegformerMaskedDepthProvider().generate(
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
    assert heightmap.provider == "segformer_masked_depth"
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


def test_bas_relief_transform_is_not_a_noop() -> None:
    """Regression canary against the previous gradient-attenuation no-op.

    The old transform produced a mean abs diff of ~146/65535 on real
    depth maps. The guided-filter replacement should be visibly active.
    """
    rng = np.random.default_rng(0)
    base = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(280, axis=0)
    detail = rng.normal(0.0, 0.02, size=base.shape).astype(np.float32)
    depth = np.clip(base + detail, 0.0, 1.0)

    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    diff_16bit = float(np.mean(np.abs(depth - relief)) * 65535.0)
    assert diff_16bit >= 1500.0, (
        f"Bas-relief transform mean abs diff {diff_16bit:.0f} (16-bit) is below the "
        f"1500 regression canary; likely back to no-op."
    )


def test_bas_relief_transform_compresses_global_range() -> None:
    """A wide-range gradient should come out compressed."""
    depth = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(200, axis=0)
    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    relief_range = float(np.max(relief) - np.min(relief))
    assert relief_range < 0.6, (
        f"Relief range {relief_range:.3f} should be < 0.6 (compression_strength=0.75 "
        f"targets ~0.25 range)"
    )


def test_bas_relief_transform_preserves_local_detail() -> None:
    """A local bump should remain visible after compression."""
    base = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(200, axis=0)
    bump = np.zeros_like(base)
    bump[80:120, 80:120] = 0.08  # a tight raised square, well below the global gradient
    depth = np.clip(base + bump, 0.0, 1.0)

    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    bump_mean = float(relief[80:120, 80:120].mean())
    surround_mean = float(relief[60:80, 80:120].mean())
    assert bump_mean > surround_mean, (
        f"Local bump should still be raised ({bump_mean:.3f}) above surround "
        f"({surround_mean:.3f}) after relief compression"
    )


def test_bas_relief_transform_handles_empty_input() -> None:
    """Empty array round-trips without raising."""
    empty = np.zeros((0, 0), dtype=np.float32)
    result = _apply_bas_relief_transform(empty)
    assert result.shape == empty.shape


def test_bas_relief_transform_handles_constant_input() -> None:
    """A flat depth map should not produce NaNs or blow up."""
    flat = np.full((50, 50), 0.5, dtype=np.float32)
    relief = _apply_bas_relief_transform(flat)
    assert relief.shape == flat.shape
    assert np.all(np.isfinite(relief))
    assert float(relief.min()) >= 0.0 and float(relief.max()) <= 1.0
