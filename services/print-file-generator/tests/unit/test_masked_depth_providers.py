import numpy as np
from PIL import Image

from app.depth import (
    DepthInferenceResult,
    MaskedDepthDetailBlendProvider,
    SubjectMaskResult,
)
from tests.support import fake_depth_result, fake_subject_mask_result, mean_adjacent_delta


def test_segformer_masked_depth_raises_subject_above_background(monkeypatch) -> None:
    image = Image.new("RGB", (6, 6), "white")

    def fake_infer_depth_result(img: Image.Image) -> DepthInferenceResult:
        return fake_depth_result(img.width, img.height)

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ) -> SubjectMaskResult:
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=1,
            y_end=5,
            x_start=1,
            x_end=5,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )

    from app.depth import SegformerMaskedDepthProvider

    heightmap = SegformerMaskedDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
    )

    subject_mean = float(np.mean(heightmap.values[1:5, 1:5]))
    background_mean = float(np.mean(heightmap.values[0, :]))
    assert subject_mean > background_mean, (
        f"Subject ({subject_mean:.3f}) should be higher than background ({background_mean:.3f})"
    )
    assert heightmap.provider == "segformer_masked_depth"
    assert heightmap.provider_audit is not None
    assert heightmap.provider_audit["monocular_depth"]["succeeded"] == "stub-depth"
    assert (
        heightmap.provider_audit["subject_segmentation"]["succeeded"]
        == "stub-segmentation"
    )
    assert heightmap.segmentation_status is not None
    assert heightmap.segmentation_status["status"] == "ok"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def test_masked_depth_detail_blend_adds_detail_only_inside_subject(
    monkeypatch,
) -> None:
    image_arr = np.full((24, 24), 180, dtype=np.uint8)
    checker = ((np.indices((24, 24)).sum(axis=0) % 2) * 130).astype(np.uint8)
    image_arr[4:20, 4:20] = checker[4:20, 4:20]
    image = Image.fromarray(image_arr).convert("RGB")

    def fake_infer_depth_result(img: Image.Image) -> DepthInferenceResult:
        return fake_depth_result(img.width, img.height)

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ) -> SubjectMaskResult:
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=6,
            y_end=18,
            x_start=6,
            x_end=18,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )

    heightmap = MaskedDepthDetailBlendProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
        detail_weight=0.35,
        detail_radius_px=2,
        detail_clip=0.1,
        compression_strength=0.0,
    )

    subject = heightmap.values[6:18, 6:18]
    background = heightmap.values[0:6, 0:18]
    assert mean_adjacent_delta(subject) > mean_adjacent_delta(background) * 2.0
    assert heightmap.provider == "masked_depth_detail_blend"
    assert heightmap.provider_audit is not None
    assert (
        heightmap.provider_audit["subject_segmentation"]["succeeded"]
        == "stub-segmentation"
    )
    assert heightmap.segmentation_status is not None
    assert heightmap.segmentation_status["foreground_labels"] == ["person"]
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def test_masked_depth_detail_blend_detail_source_changes_subject_output(
    monkeypatch,
) -> None:
    source = np.tile(np.linspace(0, 255, 24, dtype=np.uint8), (24, 1))
    source[8:16, 8:16] = 20
    image = Image.fromarray(source).convert("RGB")

    def fake_infer_depth_result(img: Image.Image) -> DepthInferenceResult:
        return fake_depth_result(img.width, img.height)

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ) -> SubjectMaskResult:
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=4,
            y_end=20,
            x_start=4,
            x_end=20,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )

    lithophane = MaskedDepthDetailBlendProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
        detail_source="lithophane_baseline",
        detail_weight=0.4,
        detail_radius_px=2,
        compression_strength=0.0,
    )
    posterized = MaskedDepthDetailBlendProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
        detail_source="posterized_luminance",
        detail_weight=0.4,
        detail_radius_px=2,
        compression_strength=0.0,
    )

    subject_diff = np.mean(
        np.abs(lithophane.values[4:20, 4:20] - posterized.values[4:20, 4:20])
    )
    background_diff = np.mean(
        np.abs(lithophane.values[0:4, :] - posterized.values[0:4, :])
    )
    assert subject_diff > background_diff
