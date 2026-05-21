from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .depth_filters import (
    _guided_filter_self,
    _image_to_unit_array,
    _normalized_gradient_magnitude,
    _resize_unit_array,
    _smooth_unit_array,
    _smoothstep_array,
)
from .depth_types import SurfaceIntentMasks
from .portrait_regions import PortraitRegionMasks


def _infer_surface_intent_masks(
    image: Image.Image,
    *,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks,
    surface_intent_policy: dict[str, object] | None,
) -> SurfaceIntentMasks:
    rgb_image = image.convert("RGB")
    width, height = rgb_image.size
    shape = (height, width)

    subject = subject_mask.astype(np.float32).clip(0.0, 1.0)
    if subject.shape != shape:
        subject = _resize_unit_array(subject, shape)

    policy_id = _surface_policy_id(surface_intent_policy)
    texture_requested = _surface_policy_requests_texture(surface_intent_policy)

    grayscale = ImageOps.grayscale(rgb_image)
    gray = _image_to_unit_array(grayscale)
    local_base = _guided_filter_self(gray, radius=max(2, min(width, height) // 32), eps=0.025)
    local_contrast = np.abs(gray - local_base).astype(np.float32)
    contrast_scale = max(float(np.percentile(local_contrast, 98.0)), 0.06)
    contrast_signal = (local_contrast / contrast_scale).clip(0.0, 1.0)
    edge_signal = _smooth_unit_array(_normalized_gradient_magnitude(gray), 0.45)

    crisp_signal = np.maximum(
        _smoothstep_array(((edge_signal - 0.50) / 0.34).clip(0.0, 1.0)),
        _smoothstep_array(((contrast_signal - 0.58) / 0.32).clip(0.0, 1.0)),
    )
    crisp_signal = _smooth_unit_array(crisp_signal, 0.55)

    portrait_smooth = _portrait_surface_intent_mask(
        shape,
        subject_mask=subject,
        portrait_regions=portrait_regions,
    )
    crisp_signal = (
        crisp_signal * (1.0 - (0.90 * portrait_smooth).clip(0.0, 0.90))
    ).clip(0.0, 1.0)
    crisp_mask = _smoothstep_array(((crisp_signal - 0.22) / 0.42).clip(0.0, 1.0))
    crisp_mask = _smooth_unit_array(crisp_mask, 0.45).clip(0.0, 1.0).astype(np.float32)
    emboss_mask = _graphic_emboss_mask(
        crisp_signal,
        portrait_smooth=portrait_smooth,
    )

    if texture_requested:
        texture_signal = _smoothstep_array(
            ((contrast_signal - 0.26) / 0.46).clip(0.0, 1.0)
        )
        texture_mask = (
            texture_signal
            * subject
            * (1.0 - 0.80 * crisp_mask)
            * (1.0 - portrait_smooth)
        )
        texture_mask = _smooth_unit_array(texture_mask, 0.9).clip(0.0, 0.65)
    else:
        texture_mask = np.zeros(shape, dtype=np.float32)

    background_mask = (1.0 - subject).clip(0.0, 1.0).astype(np.float32)
    smooth_subject = subject * (1.0 - crisp_mask) * (1.0 - texture_mask)
    smooth_background = background_mask * (1.0 - emboss_mask)
    smooth_mask = np.maximum.reduce(
        (
            0.84 * smooth_subject,
            0.96 * smooth_background,
            0.98 * portrait_smooth,
        )
    ).clip(0.0, 1.0)
    smoothing_mask = np.maximum.reduce(
        (
            0.78 * smooth_subject,
            0.94 * smooth_background,
            0.96 * portrait_smooth,
        )
    )
    smoothing_mask = (
        smoothing_mask
        * (1.0 - 0.92 * emboss_mask)
        * (1.0 - 0.62 * texture_mask)
    ).clip(0.0, 0.96)

    base_subject_detail = 0.18 * subject * (1.0 - 0.88 * smooth_mask)
    detail_weight_map = np.maximum.reduce(
        (
            base_subject_detail,
            0.98 * crisp_mask,
            0.34 * texture_mask,
        )
    ).clip(0.0, 1.0).astype(np.float32)

    metadata = {
        "policy_id": policy_id,
        "version": "inferred-v1",
        "source": "inferred",
        "default_treatment": "smooth",
        "texture_status": (
            "enabled_requested" if texture_requested else "disabled_unrequested"
        ),
        "classes": {
            "smooth": [
                "smooth_skin",
                "smooth_scalp",
                "smooth_neck",
                "smooth_ears",
                "smooth_hands",
                "smooth_body",
                "smooth_simple_clothing",
                "flat_background",
            ],
            "crisp": [
                "raised_text",
                "raised_logo",
                "graphic_edge",
                "panel_line",
            ],
            "texture": [
                "hair_texture",
                "fabric_texture",
                "material_texture",
            ],
        },
        "masks": {
            "smooth": _surface_mask_summary(smooth_mask),
            "crisp": _surface_mask_summary(crisp_mask),
            "emboss": _surface_mask_summary(emboss_mask),
            "texture": _surface_mask_summary(texture_mask),
            "smoothing": _surface_mask_summary(smoothing_mask),
            "detail_weight": _surface_mask_summary(detail_weight_map),
            "background": _surface_mask_summary(background_mask),
            "portrait_smooth": _surface_mask_summary(portrait_smooth),
        },
    }

    return SurfaceIntentMasks(
        smooth_mask=smooth_mask.astype(np.float32),
        crisp_mask=crisp_mask.astype(np.float32),
        emboss_mask=emboss_mask.astype(np.float32),
        texture_mask=texture_mask.astype(np.float32),
        smoothing_mask=smoothing_mask.astype(np.float32),
        detail_weight_map=detail_weight_map.astype(np.float32),
        background_mask=background_mask,
        metadata=metadata,
    )

def _surface_policy_id(surface_intent_policy: dict[str, object] | None) -> str:
    if isinstance(surface_intent_policy, dict):
        policy_id = surface_intent_policy.get("policy_id")
        if isinstance(policy_id, str) and policy_id:
            return policy_id
    return "smooth-default-v1"

def _surface_policy_requests_texture(
    surface_intent_policy: dict[str, object] | None,
) -> bool:
    if not isinstance(surface_intent_policy, dict):
        return False

    regions = surface_intent_policy.get("regions")
    if not isinstance(regions, list):
        return False

    texture_intents = {"hair_texture", "fabric_texture", "material_texture"}
    explicit_sources = {"proof_generation", "human_override"}
    for region in regions:
        if not isinstance(region, dict):
            continue
        if region.get("intent") not in texture_intents:
            continue
        if region.get("treatment") != "shallow_texture":
            continue
        if region.get("source") not in explicit_sources:
            continue
        try:
            detail_weight = float(region.get("detail_weight", 0.0))
        except (TypeError, ValueError):
            detail_weight = 0.0
        if detail_weight > 0.0:
            return True
    return False

def _portrait_surface_intent_mask(
    shape: tuple[int, int],
    *,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks,
) -> np.ndarray:
    height, width = shape
    if portrait_regions.face_oval.shape != shape or portrait_regions.face_count == 0:
        return np.zeros(shape, dtype=np.float32)

    smooth = np.maximum.reduce(
        (
            0.94 * portrait_regions.face_oval,
            0.98 * portrait_regions.central_face,
            0.90 * portrait_regions.eyes,
            0.86 * portrait_regions.nose,
            0.90 * portrait_regions.mouth,
        )
    )

    for x, y, box_width, box_height in portrait_regions.boxes:
        smooth = np.maximum(
            smooth,
            _soft_rect_mask(
                width,
                height,
                x + 0.14 * box_width,
                y - 0.16 * box_height,
                x + 0.86 * box_width,
                y + 0.22 * box_height,
                feather_px=max(2.0, 0.08 * box_width),
            ),
        )
        smooth = np.maximum(
            smooth,
            _soft_rect_mask(
                width,
                height,
                x + 0.34 * box_width,
                y + 0.70 * box_height,
                x + 0.66 * box_width,
                y + 1.12 * box_height,
                feather_px=max(2.0, 0.07 * box_width),
            ),
        )
        smooth = np.maximum(
            smooth,
            _soft_rect_mask(
                width,
                height,
                x - 0.12 * box_width,
                y + 0.32 * box_height,
                x + 0.12 * box_width,
                y + 0.64 * box_height,
                feather_px=max(2.0, 0.06 * box_width),
            ),
        )
        smooth = np.maximum(
            smooth,
            _soft_rect_mask(
                width,
                height,
                x + 0.88 * box_width,
                y + 0.32 * box_height,
                x + 1.12 * box_width,
                y + 0.64 * box_height,
                feather_px=max(2.0, 0.06 * box_width),
            ),
        )
        smooth = np.maximum(
            smooth,
            0.70
            * _soft_rect_mask(
                width,
                height,
                x - 0.44 * box_width,
                y + 0.82 * box_height,
                x + 1.44 * box_width,
                y + 1.96 * box_height,
                feather_px=max(3.0, 0.13 * box_width),
            ),
        )

    subject = subject_mask.astype(np.float32).clip(0.0, 1.0)
    if subject.shape != shape:
        subject = _resize_unit_array(subject, shape)

    return (smooth * np.maximum(subject, portrait_regions.face_oval)).clip(
        0.0,
        1.0,
    ).astype(np.float32)

def _soft_rect_mask(
    width: int,
    height: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    *,
    feather_px: float,
) -> np.ndarray:
    left = max(0, min(width, int(np.floor(min(x0, x1)))))
    right = max(0, min(width, int(np.ceil(max(x0, x1)))))
    top = max(0, min(height, int(np.floor(min(y0, y1)))))
    bottom = max(0, min(height, int(np.ceil(max(y0, y1)))))
    mask = np.zeros((height, width), dtype=np.float32)
    if right <= left or bottom <= top:
        return mask

    mask[top:bottom, left:right] = 1.0
    return _smooth_unit_array(mask, max(0.5, feather_px)).clip(0.0, 1.0)

def _graphic_emboss_mask(
    crisp_signal: np.ndarray,
    *,
    portrait_smooth: np.ndarray,
) -> np.ndarray:
    strong = _smoothstep_array(((crisp_signal - 0.38) / 0.34).clip(0.0, 1.0))
    cleaned = _pil_filter_unit_mask(strong, ImageFilter.MedianFilter(size=3))
    expanded = _pil_filter_unit_mask(cleaned, ImageFilter.MaxFilter(size=5))
    expanded = _smooth_unit_array(expanded, 0.85)
    expanded = expanded * (1.0 - 0.95 * portrait_smooth.clip(0.0, 1.0))
    return expanded.clip(0.0, 1.0).astype(np.float32)

def _pil_filter_unit_mask(
    mask: np.ndarray,
    image_filter: ImageFilter.Filter,
) -> np.ndarray:
    values = mask.astype(np.float32)
    if values.size == 0:
        return values
    image = Image.fromarray((values.clip(0.0, 1.0) * 255.0).round().astype(np.uint8))
    filtered = image.filter(image_filter)
    return (np.asarray(filtered, dtype=np.float32) / 255.0).clip(0.0, 1.0)

def _surface_mask_summary(mask: np.ndarray) -> dict[str, object]:
    values = mask.astype(np.float32)
    return {
        "coverage": float(np.mean(values > 0.05)) if values.size else 0.0,
        "mean": float(np.mean(values)) if values.size else 0.0,
        "peak": float(np.max(values)) if values.size else 0.0,
    }

def _compose_surface_detail_weight_map(
    *,
    surface_intent: SurfaceIntentMasks,
    portrait_detail_weight_map: np.ndarray,
) -> np.ndarray:
    detail_map = surface_intent.detail_weight_map
    if portrait_detail_weight_map.shape != detail_map.shape:
        return detail_map.astype(np.float32)

    portrait_damped = detail_map * portrait_detail_weight_map.astype(np.float32)
    composed = np.maximum.reduce(
        (
            portrait_damped,
            0.98 * surface_intent.crisp_mask,
            0.30 * surface_intent.texture_mask,
        )
    )
    return composed.clip(0.0, 1.0).astype(np.float32)

def _apply_graphic_emboss_layer(
    relief_depth: np.ndarray,
    *,
    surface_intent: SurfaceIntentMasks,
    strength: float = 0.045,
) -> np.ndarray:
    if relief_depth.size == 0 or surface_intent.emboss_mask.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    raised = _smooth_unit_array(surface_intent.emboss_mask, 0.65)
    return (
        relief_depth.astype(np.float32)
        + float(np.clip(strength, 0.0, 1.0)) * raised.astype(np.float32)
    ).clip(0.0, 1.0).astype(np.float32)

def _apply_surface_intent_smoothing(
    relief_depth: np.ndarray,
    *,
    surface_intent: SurfaceIntentMasks,
    radius_px: float = 1.8,
    background_radius_px: float = 4.0,
) -> np.ndarray:
    if relief_depth.size == 0 or surface_intent.smoothing_mask.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    smoothed = _smooth_unit_array(relief_depth, radius_px)
    broad_smoothed = _smooth_unit_array(relief_depth, background_radius_px)
    structural_base = _guided_filter_self(
        relief_depth.astype(np.float32),
        radius=5,
        eps=0.025,
    )
    structural_edges = _normalized_gradient_magnitude(structural_base)
    edge_protection = _smoothstep_array(
        ((structural_edges - 0.22) / 0.45).clip(0.0, 1.0)
    )
    crisp_protection = np.maximum(
        np.maximum(surface_intent.crisp_mask, surface_intent.emboss_mask),
        0.55 * surface_intent.texture_mask,
    ).clip(0.0, 1.0)
    smoothing_mask = (
        surface_intent.smoothing_mask
        * (1.0 - edge_protection)
        * (1.0 - 0.94 * crisp_protection)
    ).clip(0.0, 0.76)

    blended = (
        relief_depth.astype(np.float32) * (1.0 - smoothing_mask)
        + smoothed.astype(np.float32) * smoothing_mask
    )
    background_mask = (
        0.68
        * surface_intent.background_mask
        * (1.0 - 0.94 * surface_intent.emboss_mask)
    ).clip(0.0, 0.68)
    return (
        blended.astype(np.float32) * (1.0 - background_mask)
        + broad_smoothed.astype(np.float32) * background_mask
    ).clip(0.0, 1.0).astype(np.float32)

def _surface_roughness_metrics(
    relief_depth: np.ndarray,
    *,
    surface_intent: SurfaceIntentMasks,
) -> dict[str, object]:
    values = relief_depth.astype(np.float32)
    smooth_subject = (
        surface_intent.smooth_mask
        * (1.0 - surface_intent.background_mask)
        * (1.0 - surface_intent.emboss_mask)
    ).clip(0.0, 1.0)
    flat_background = (
        surface_intent.background_mask * (1.0 - surface_intent.emboss_mask)
    ).clip(0.0, 1.0)
    crisp_graphic = np.maximum(
        surface_intent.crisp_mask,
        surface_intent.emboss_mask,
    ).clip(0.0, 1.0)

    thresholds = {
        "smooth_subject": 0.030,
        "flat_background": 0.020,
        "crisp_graphic_min": 0.018,
    }
    smooth_summary = _roughness_summary(
        values,
        smooth_subject,
        max_mean_adjacent_delta=thresholds["smooth_subject"],
    )
    background_summary = _roughness_summary(
        values,
        flat_background,
        max_mean_adjacent_delta=thresholds["flat_background"],
    )
    graphic_summary = _roughness_summary(
        values,
        crisp_graphic,
        min_mean_adjacent_delta=thresholds["crisp_graphic_min"],
    )
    warnings: list[str] = []
    if smooth_summary.get("status") == "warning":
        warnings.append("smooth_subject_roughness_high")
    if background_summary.get("status") == "warning":
        warnings.append("flat_background_roughness_high")
    if graphic_summary.get("status") == "warning":
        warnings.append("crisp_graphic_relief_too_flat")

    return {
        "version": "region-roughness-v1",
        "source": "relief_depth_pre_mesh_resize",
        "unit": "normalized_depth_mean_adjacent_delta",
        "thresholds": thresholds,
        "regions": {
            "smooth_subject": smooth_summary,
            "flat_background": background_summary,
            "crisp_graphic": graphic_summary,
        },
        "warnings": warnings,
    }

def _roughness_summary(
    values: np.ndarray,
    mask: np.ndarray,
    *,
    max_mean_adjacent_delta: float | None = None,
    min_mean_adjacent_delta: float | None = None,
) -> dict[str, object]:
    active = mask.astype(np.float32) > 0.50
    active_pixels = int(np.count_nonzero(active))
    if active_pixels < 4:
        return {
            "status": "skipped",
            "reason": "insufficient_region_pixels",
            "active_pixels": active_pixels,
            "coverage": float(np.mean(active)) if active.size else 0.0,
        }

    deltas: list[np.ndarray] = []
    horizontal_mask = active[:, 1:] & active[:, :-1]
    if np.any(horizontal_mask):
        deltas.append(np.abs(values[:, 1:] - values[:, :-1])[horizontal_mask])
    vertical_mask = active[1:, :] & active[:-1, :]
    if np.any(vertical_mask):
        deltas.append(np.abs(values[1:, :] - values[:-1, :])[vertical_mask])
    if not deltas:
        return {
            "status": "skipped",
            "reason": "insufficient_adjacent_pixels",
            "active_pixels": active_pixels,
            "coverage": float(np.mean(active)),
        }

    adjacent = np.concatenate(deltas).astype(np.float32)
    mean_delta = float(np.mean(adjacent))
    p95_delta = float(np.percentile(adjacent, 95.0))
    status = "ok"
    if (
        max_mean_adjacent_delta is not None
        and mean_delta > max_mean_adjacent_delta
    ):
        status = "warning"
    if (
        min_mean_adjacent_delta is not None
        and mean_delta < min_mean_adjacent_delta
    ):
        status = "warning"

    return {
        "status": status,
        "active_pixels": active_pixels,
        "coverage": float(np.mean(active)),
        "mean_adjacent_delta": mean_delta,
        "p95_adjacent_delta": p95_delta,
    }
