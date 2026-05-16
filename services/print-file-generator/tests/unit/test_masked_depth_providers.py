import numpy as np
import pytest
from PIL import Image

from app.depth import (
    DepthInferenceResult,
    Heightmap,
    MaskedDepthDetailBlendProvider,
    SubjectMaskResult,
    _apply_portrait_nose_relief_prior,
    _apply_portrait_surface_smoothing,
    _apply_subject_surface_smoothing,
    _smooth_subject_mask_contour,
    apply_image_window_edge_fade,
    prepare_geometry_analysis_image,
    resize_heightmap_to_shape,
)
from app.portrait_regions import masks_from_face_boxes
from tests.support import (
    fake_depth_result,
    fake_no_face_regions,
    fake_subject_mask_result,
    mean_adjacent_delta,
)


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
    assert heightmap.face_analysis_status is not None
    assert heightmap.face_analysis_status["status"] in {
        "no_face",
        "single_face",
        "multiple_faces",
    }
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


def test_image_window_edge_fade_settles_relief_at_boundary() -> None:
    values = np.full((12, 10), 4.2, dtype=np.float32)
    values[5:7, 4:6] = 1.6
    heightmap = Heightmap(
        values=values,
        min_height_mm=1.6,
        max_height_mm=4.2,
        provider="masked_depth_detail_blend",
    )

    faded = apply_image_window_edge_fade(heightmap, fade_width_px=3)

    assert np.allclose(faded.values[0, :], 1.6)
    assert np.allclose(faded.values[:, 0], 1.6)
    assert float(faded.values[6, 5]) == np.float32(1.6)
    assert float(faded.values[4, 5]) > 3.8


def test_heightmap_resizes_from_analysis_to_mesh_shape() -> None:
    values = np.tile(np.linspace(1.6, 4.2, 16, dtype=np.float32), (24, 1))
    heightmap = Heightmap(
        values=values,
        min_height_mm=1.6,
        max_height_mm=4.2,
        provider="masked_depth_detail_blend",
    )

    resized = resize_heightmap_to_shape(heightmap, target_shape=(6, 4))

    assert resized.values.shape == (6, 4)
    assert resized.min_height_mm >= 1.6
    assert resized.max_height_mm <= 4.2
    assert float(resized.values[3, -1] - resized.values[3, 0]) > 1.8


def test_subject_mask_contour_smoothing_feathers_blocky_edges() -> None:
    raw = np.zeros((24, 24), dtype=np.float32)
    raw[4:12, 6:14] = 1.0
    raw[12:20, 10:18] = 1.0

    smoothed = _smooth_subject_mask_contour(raw, feather_radius_px=4.0)

    assert smoothed.shape == raw.shape
    assert float(np.max(smoothed)) > 0.9
    assert float(np.min(smoothed)) == 0.0
    assert np.any((smoothed > 0.05) & (smoothed < 0.95))
    assert float(np.mean(smoothed > 0.5)) == pytest.approx(float(np.mean(raw > 0.5)), abs=0.10)


def test_geometry_analysis_image_suppresses_halo_but_keeps_subject() -> None:
    image = Image.new("RGB", (28, 28), (120, 120, 120))
    pixels = image.load()
    for y in range(7, 21):
        for x in range(7, 21):
            pixels[x, y] = (35, 35, 35)
    for index in range(6, 22):
        pixels[index, 6] = (255, 255, 255)
        pixels[index, 21] = (255, 255, 255)
        pixels[6, index] = (255, 255, 255)
        pixels[21, index] = (255, 255, 255)
    mask = np.zeros((28, 28), dtype=np.float32)
    mask[7:21, 7:21] = 1.0

    cleaned = prepare_geometry_analysis_image(
        image,
        subject_mask=mask,
        portrait_regions=fake_no_face_regions(28, 28),
    )
    cleaned_arr = np.asarray(cleaned, dtype=np.uint8)

    assert int(cleaned_arr[6, 14, 0]) < 190
    assert int(cleaned_arr[14, 14, 0]) < 80


def test_portrait_region_boxes_create_soft_face_eye_and_mouth_masks() -> None:
    masks = masks_from_face_boxes(width=80, height=100, boxes=((20, 18, 40, 58),))

    assert masks.status == "single_face"
    assert masks.face_count == 1
    assert masks.face_oval[48, 40] > 0.9
    assert masks.central_face[48, 40] > 0.9
    assert masks.eyes[41, 34] > 0.5
    assert masks.eyes[41, 46] > 0.5
    assert masks.nose[50, 40] > 0.7
    assert masks.mouth[60, 40] > 0.5
    assert masks.face_oval[5, 5] == 0.0


def test_portrait_nose_relief_prior_raises_nose_region() -> None:
    width, height = 80, 100
    relief_depth = np.full((height, width), 0.42, dtype=np.float32)
    portrait = masks_from_face_boxes(width=width, height=height, boxes=((20, 18, 40, 58),))

    shaped = _apply_portrait_nose_relief_prior(
        relief_depth,
        portrait_regions=portrait,
        strength=0.09,
    )

    nose_zone = portrait.nose > 0.55
    cheek_zone = (portrait.central_face > 0.5) & (portrait.nose < 0.05)
    assert float(np.mean(shaped[nose_zone])) > float(np.mean(shaped[cheek_zone])) + 0.02


def test_masked_depth_detail_blend_damps_eye_mouth_detail_without_flattening_face(
    monkeypatch,
) -> None:
    width, height = 72, 96
    gradient = np.tile(np.linspace(70, 220, width, dtype=np.uint8), (height, 1))
    checker = ((np.indices((height, width)).sum(axis=0) % 2) * 150).astype(np.uint8)
    source = gradient.copy()
    source[34:42, 24:48] = checker[34:42, 24:48]
    source[64:74, 26:46] = checker[64:74, 26:46]
    image = Image.fromarray(source).convert("RGB")
    portrait = masks_from_face_boxes(width=width, height=height, boxes=((16, 18, 40, 60),))

    def fake_infer_depth_result(img: Image.Image) -> DepthInferenceResult:
        row = np.linspace(0.0, 1.0, img.width, dtype=np.float32)
        return DepthInferenceResult(depth=np.tile(row, (img.height, 1)))

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ) -> SubjectMaskResult:
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=8,
            y_end=88,
            x_start=8,
            x_end=64,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )
    monkeypatch.setattr(
        "app.depth.analyze_portrait_regions",
        lambda img: fake_no_face_regions(img.width, img.height),
    )
    no_face = MaskedDepthDetailBlendProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
        detail_weight=0.6,
        detail_radius_px=2,
        detail_clip=0.08,
        compression_strength=0.0,
    )

    monkeypatch.setattr("app.depth.analyze_portrait_regions", lambda img: portrait)
    face_aware = MaskedDepthDetailBlendProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
        post_smooth_radius_px=0,
        detail_weight=0.6,
        detail_radius_px=2,
        detail_clip=0.08,
        compression_strength=0.0,
    )

    eye_zone = portrait.eyes > 0.45
    mouth_zone = portrait.mouth > 0.45
    eye_delta = float(np.mean(np.abs(face_aware.values[eye_zone] - no_face.values[eye_zone])))
    mouth_delta = float(
        np.mean(np.abs(face_aware.values[mouth_zone] - no_face.values[mouth_zone]))
    )
    left_face = float(np.mean(face_aware.values[30:70, 22:30]))
    right_face = float(np.mean(face_aware.values[30:70, 46:54]))

    assert eye_delta > 0.15
    assert mouth_delta > 0.15
    assert right_face - left_face > 0.35
    assert face_aware.face_analysis_status is not None
    assert face_aware.face_analysis_status["status"] == "single_face"


def test_portrait_surface_smoothing_reduces_face_roughness_but_keeps_gradient() -> None:
    width, height = 72, 96
    x_gradient = np.tile(np.linspace(0.25, 0.75, width, dtype=np.float32), (height, 1))
    noise = ((np.indices((height, width)).sum(axis=0) % 2) * 0.18).astype(np.float32)
    relief_depth = (x_gradient + noise).clip(0.0, 1.0)
    portrait = masks_from_face_boxes(width=width, height=height, boxes=((16, 18, 40, 60),))

    smoothed = _apply_portrait_surface_smoothing(
        relief_depth,
        portrait_regions=portrait,
        radius_px=2.4,
    )

    face_zone = portrait.central_face > 0.45
    original_face_roughness = mean_adjacent_delta(relief_depth[30:70, 22:54])
    smoothed_face_roughness = mean_adjacent_delta(smoothed[30:70, 22:54])
    left_face = float(np.mean(smoothed[face_zone & (np.indices((height, width))[1] < 32)]))
    right_face = float(np.mean(smoothed[face_zone & (np.indices((height, width))[1] > 44)]))

    assert smoothed_face_roughness < original_face_roughness * 0.65
    assert right_face - left_face > 0.10


def test_subject_surface_smoothing_reduces_texture_without_erasing_edges() -> None:
    width, height = 80, 80
    relief_depth = np.full((height, width), 0.42, dtype=np.float32)
    relief_depth[:, 42:] += 0.26
    texture = ((np.indices((height, width)).sum(axis=0) % 2) * 0.10).astype(np.float32)
    relief_depth = (relief_depth + texture).clip(0.0, 1.0)
    subject_mask = np.ones((height, width), dtype=np.float32)

    smoothed = _apply_subject_surface_smoothing(
        relief_depth,
        subject_mask=subject_mask,
        radius_px=1.8,
        strength=0.42,
    )

    original_flat_roughness = mean_adjacent_delta(relief_depth[12:68, 12:34])
    smoothed_flat_roughness = mean_adjacent_delta(smoothed[12:68, 12:34])
    original_edge_step = float(
        np.mean(relief_depth[12:68, 44]) - np.mean(relief_depth[12:68, 39])
    )
    smoothed_edge_step = float(
        np.mean(smoothed[12:68, 44]) - np.mean(smoothed[12:68, 39])
    )

    assert smoothed_flat_roughness < original_flat_roughness * 0.78
    assert smoothed_edge_step > original_edge_step * 0.82
