from __future__ import annotations

from typing import Any, Literal

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .depth_debug import _hybrid_debug_artifacts
from .depth_filters import (
    _apply_bas_relief_transform,
    _apply_tone_curve,
    _depth_to_heights,
    _guided_filter_self,
    _image_to_unit_array,
    _normalize_depth,
    _normalize_unit_array,
    _normalized_edge_detail,
    _resize_unit_array,
    _smooth_unit_array,
)
from .depth_inference import _infer_depth_anything_v2_small_result
from .depth_types import (
    BASE_SMOOTH_RADIUS_PX,
    EDGE_DETAIL_WEIGHT,
    EDGE_SMOOTH_RADIUS_PX,
    POSTER_RELIEF_BANDS,
    TERRACE_SMOOTH_RADIUS_PX,
    Heightmap,
    HeightmapProviderName,
    SubjectMaskResult,
)
from .experimental.triposr_sidecar import TripoSRSidecarProvider
from .geometry_input import prepare_geometry_analysis_image
from .portrait_regions import analyze_portrait_regions
from .portrait_relief import (
    _apply_portrait_face_pit_guard,
    _apply_portrait_surface_smoothing,
    _portrait_detail_weight_map,
)
from .providers.base import ProviderAudit
from .segmentation_masks import _generate_subject_mask_result
from .surface_intent import (
    _apply_graphic_emboss_layer,
    _apply_surface_intent_smoothing,
    _compose_surface_detail_weight_map,
    _infer_surface_intent_masks,
    _surface_roughness_metrics,
)


class LuminanceDepthProvider:
    name = "posterized_luminance"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.0,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        smoothed_luminance = ImageOps.autocontrast(
            grayscale.filter(ImageFilter.GaussianBlur(radius=BASE_SMOOTH_RADIUS_PX)),
            cutoff=1,
        )
        luminance = _apply_tone_curve(
            _image_to_unit_array(smoothed_luminance),
            contrast=contrast,
            gamma=gamma,
        )

        posterized = np.round(luminance * (POSTER_RELIEF_BANDS - 1)) / (
            POSTER_RELIEF_BANDS - 1
        )
        posterized_image = Image.fromarray(
            (posterized * 255.0).clip(0, 255).astype(np.uint8),
            mode="L",
        ).filter(ImageFilter.GaussianBlur(radius=TERRACE_SMOOTH_RADIUS_PX))
        posterized = _image_to_unit_array(posterized_image)

        edge_detail = _image_to_unit_array(
            grayscale.filter(ImageFilter.FIND_EDGES).filter(
                ImageFilter.GaussianBlur(radius=EDGE_SMOOTH_RADIUS_PX)
            )
        )
        edge_detail = edge_detail / max(float(np.max(edge_detail)), 1e-6)

        printable_depth = (
            1.0 - posterized + EDGE_DETAIL_WEIGHT * edge_detail
        ).clip(0.0, 1.0)
        printable_depth = _smooth_unit_array(printable_depth, post_smooth_radius_px)
        relief = min_relief_mm + printable_depth * (max_relief_mm - min_relief_mm)
        heights = base_thickness_mm + relief

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )

class ContinuousLuminanceDepthProvider:
    name = "continuous_luminance"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        smoothed_luminance = ImageOps.autocontrast(
            grayscale.filter(ImageFilter.GaussianBlur(radius=1.2)),
            cutoff=1,
        )
        luminance = _apply_tone_curve(
            _image_to_unit_array(smoothed_luminance),
            contrast=contrast,
            gamma=gamma,
        )

        edge_detail = _normalized_edge_detail(grayscale)
        printable_depth = (1.0 - luminance + 0.08 * edge_detail).clip(0.0, 1.0)
        printable_depth = _smooth_unit_array(printable_depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            printable_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )

class LithophaneBaselineDepthProvider:
    name = "lithophane_baseline"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.4,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        luminance = _apply_tone_curve(
            _image_to_unit_array(ImageOps.autocontrast(grayscale, cutoff=0)),
            contrast=contrast,
            gamma=gamma,
        )

        thickness = np.power(1.0 - luminance, 1.15).clip(0.0, 1.0)
        thickness = _smooth_unit_array(thickness, post_smooth_radius_px)
        heights = _depth_to_heights(
            thickness,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )

class DepthAnythingV2SmallDepthProvider:
    name = "depth_anything_v2_small"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)
        depth = _smooth_unit_array(depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(monocular_depth=depth_result.audit),
        )

class DepthAnythingV2SmallBasReliefProvider:
    name = "depth_anything_v2_small_bas_relief"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Apply bas-relief gradient compression
        relief_depth = _apply_bas_relief_transform(depth, compression_strength=0.75)

        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(monocular_depth=depth_result.audit),
        )

class SegformerMaskedDepthProvider:
    """Experiment 4: combine Depth Anything V2 Small with SegFormer subject masks.

    Pipeline:
    1. Run Depth Anything V2 Small for semantic depth.
    2. Run SegFormer (nvidia/segformer-b0-finetuned-ade-512-512) via the HF
       Inference API for ADE20K-class segmentation.
    3. Merge all non-background labels into a single foreground mask.
    4. Soft-blur the mask edges to avoid harsh cutout ridges.
    5. Boost subject depth, suppress background depth.
    6. Apply bas-relief gradient compression.

    Originally registered as ``sam_masked_depth``. Renamed to reflect the
    actual SegFormer-based implementation. Historical experiment artifacts
    under ``.tmp/experiments/experiment_4/sam_masked_depth/`` retain the old
    name and metadata.
    """

    name = "segformer_masked_depth"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
        subject_boost: float = 1.0,
        background_scale: float = 0.3,
        mask_blur_radius_px: float = 5.0,
        compression_strength: float = 0.75,
    ) -> Heightmap:
        # Semantic depth
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Subject mask
        subject_mask_result = _generate_subject_mask_result(
            image,
            blur_radius_px=mask_blur_radius_px,
        )
        subject_mask = subject_mask_result.mask

        # Layer: boost subject, suppress background
        layered = depth * (subject_boost * subject_mask + background_scale * (1.0 - subject_mask))
        # Re-normalize to [0, 1]
        l_min, l_max = float(np.min(layered)), float(np.max(layered))
        if l_max - l_min > 1e-6:
            layered = (layered - l_min) / (l_max - l_min)
        else:
            layered = np.zeros_like(layered)
        layered = layered.clip(0.0, 1.0).astype(np.float32)

        # Bas-relief compression
        relief_depth = _apply_bas_relief_transform(layered, compression_strength=compression_strength)
        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)

        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(
                monocular_depth=depth_result.audit,
                subject_segmentation=subject_mask_result.audit,
            ),
            segmentation_status=_segmentation_status_to_dict(subject_mask_result),
        )

class MaskedDepthDetailBlendProvider:
    """Hybrid candidate: semantic depth, subject mask, and in-mask detail.

    This is the next prototype path after the five-experiment review:
    Depth Anything supplies the low-frequency image-plane shape, SegFormer
    supplies subject/background control, and a deterministic detail source
    restores subject-only facial/local texture before bas-relief compression.
    """

    name = "masked_depth_detail_blend"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
        detail_source: Literal[
            "lithophane_baseline",
            "posterized_luminance",
        ] = "lithophane_baseline",
        detail_weight: float = 0.12,
        detail_radius_px: int = 9,
        detail_clip: float = 0.14,
        subject_boost: float = 1.0,
        background_scale: float = 0.22,
        mask_blur_radius_px: float = 5.0,
        compression_strength: float = 0.75,
        surface_intent_policy: dict[str, object] | None = None,
    ) -> Heightmap:
        subject_mask_result = _generate_subject_mask_result(
            image,
            blur_radius_px=mask_blur_radius_px,
        )
        subject_mask = subject_mask_result.mask
        portrait_regions = analyze_portrait_regions(image)
        surface_intent = _infer_surface_intent_masks(
            image,
            subject_mask=subject_mask,
            portrait_regions=portrait_regions,
            surface_intent_policy=surface_intent_policy,
        )
        geometry_image = prepare_geometry_analysis_image(
            image,
            subject_mask=subject_mask,
            portrait_regions=portrait_regions,
        )

        depth_result = _infer_depth_anything_v2_small_result(geometry_image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        if depth.shape != subject_mask.shape:
            depth = _resize_unit_array(depth, subject_mask.shape)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        semantic_base = depth * (
            subject_boost * subject_mask + background_scale * (1.0 - subject_mask)
        )
        semantic_base = _normalize_unit_array(semantic_base)

        detail_unit = _deterministic_detail_unit(
            geometry_image,
            source=detail_source,
            contrast=contrast,
            gamma=gamma,
        )
        crisp_detail_unit = _deterministic_detail_unit(
            image,
            source=detail_source,
            contrast=contrast,
            gamma=gamma,
        )
        intent_detail_source_mask = np.maximum(
            surface_intent.crisp_mask,
            surface_intent.texture_mask,
        )
        detail_unit = (
            detail_unit * (1.0 - intent_detail_source_mask)
            + crisp_detail_unit * intent_detail_source_mask
        ).clip(0.0, 1.0).astype(np.float32)
        detail_layer = _extract_subject_detail_layer(
            detail_unit,
            radius=detail_radius_px,
            clip=detail_clip,
        )

        portrait_detail_weight_map = _portrait_detail_weight_map(
            detail_layer.shape,
            portrait_regions=portrait_regions,
        )
        detail_weight_map = _compose_surface_detail_weight_map(
            surface_intent=surface_intent,
            portrait_detail_weight_map=portrait_detail_weight_map,
        )

        blended = (
            semantic_base
            + detail_weight * detail_weight_map * detail_layer
            + 0.018 * surface_intent.crisp_mask
            + 0.038 * surface_intent.emboss_mask
        )
        blended = blended.clip(0.0, 1.0).astype(np.float32)

        relief_depth = _apply_bas_relief_transform(
            blended,
            compression_strength=compression_strength,
        )
        relief_depth = _apply_graphic_emboss_layer(
            relief_depth,
            surface_intent=surface_intent,
        )
        relief_depth = _apply_surface_intent_smoothing(
            relief_depth,
            surface_intent=surface_intent,
        )
        relief_depth = _apply_portrait_surface_smoothing(
            relief_depth,
            portrait_regions=portrait_regions,
        )
        relief_depth = _apply_portrait_face_pit_guard(
            relief_depth,
            portrait_regions=portrait_regions,
        )
        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)
        surface_intent.metadata["roughness_metrics"] = _surface_roughness_metrics(
            relief_depth,
            surface_intent=surface_intent,
        )

        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(
                monocular_depth=depth_result.audit,
                subject_segmentation=subject_mask_result.audit,
            ),
            segmentation_status=_segmentation_status_to_dict(subject_mask_result),
            face_analysis_status=portrait_regions.to_metadata(),
            surface_intent_status=surface_intent.metadata,
            debug_artifacts=_hybrid_debug_artifacts(
                geometry_image=geometry_image,
                subject_mask=subject_mask,
                portrait_regions=portrait_regions,
                surface_intent=surface_intent,
                semantic_base=semantic_base,
                detail_layer=detail_layer,
                detail_weight_map=detail_weight_map,
                blended=blended,
                relief_depth=relief_depth,
            ),
        )

def _deterministic_detail_unit(
    image: Image.Image,
    *,
    source: Literal["lithophane_baseline", "posterized_luminance"],
    contrast: float,
    gamma: float,
) -> np.ndarray:
    """Generate a unit detail reference from deterministic providers."""
    provider: Any
    if source == "lithophane_baseline":
        provider = LithophaneBaselineDepthProvider()
    elif source == "posterized_luminance":
        provider = LuminanceDepthProvider()
    else:
        raise ValueError(f"Unsupported detail source: {source}")

    detail_heightmap = provider.generate(
        image,
        base_thickness_mm=0.0,
        min_relief_mm=0.0,
        max_relief_mm=1.0,
        contrast=contrast,
        gamma=gamma,
        post_smooth_radius_px=0.0,
    )
    return _normalize_unit_array(detail_heightmap.values)


def _extract_subject_detail_layer(
    detail_unit: np.ndarray,
    *,
    radius: int,
    clip: float,
) -> np.ndarray:
    """High-frequency deterministic detail in [-1, 1] for masked blending."""
    if detail_unit.size == 0:
        return detail_unit.astype(np.float32)

    base = _guided_filter_self(
        detail_unit.astype(np.float32),
        radius=max(1, int(radius)),
        eps=0.02,
    )
    high_frequency = detail_unit.astype(np.float32) - base
    if clip <= 0:
        return high_frequency.astype(np.float32)

    return (np.clip(high_frequency, -clip, clip) / clip).astype(np.float32)


def _provider_audit_map(**audits: ProviderAudit | None) -> dict[str, dict[str, object]]:
    return {
        role: audit.to_dict()
        for role, audit in audits.items()
        if audit is not None
    }

def _segmentation_status_to_dict(result: SubjectMaskResult) -> dict[str, object]:
    return {
        "status": result.status,
        "mask_coverage": result.mask_coverage,
        "foreground_labels": list(result.foreground_labels),
        "raw_segment_count": result.raw_segment_count,
    }

def get_depth_provider(name: HeightmapProviderName) -> Any:
    providers = {
        "posterized_luminance": LuminanceDepthProvider,
        "continuous_luminance": ContinuousLuminanceDepthProvider,
        "lithophane_baseline": LithophaneBaselineDepthProvider,
        "depth_anything_v2_small": DepthAnythingV2SmallDepthProvider,
        "depth_anything_v2_small_bas_relief": DepthAnythingV2SmallBasReliefProvider,
        "segformer_masked_depth": SegformerMaskedDepthProvider,
        "masked_depth_detail_blend": MaskedDepthDetailBlendProvider,
        "triposr_sidecar": TripoSRSidecarProvider,
    }
    return providers[name]()
