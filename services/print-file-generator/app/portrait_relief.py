from __future__ import annotations

import numpy as np

from .depth_filters import (
    _guided_filter_self,
    _normalized_gradient_magnitude,
    _smooth_unit_array,
    _smoothstep_array,
)
from .portrait_regions import PortraitRegionMasks


def _portrait_detail_weight_map(
    shape: tuple[int, int],
    *,
    portrait_regions: PortraitRegionMasks,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return np.ones(shape, dtype=np.float32)
    if portrait_regions.central_face.shape != shape:
        return np.ones(shape, dtype=np.float32)

    feature_mask = np.maximum.reduce(
        (
            portrait_regions.eyes,
            portrait_regions.nose,
            portrait_regions.mouth,
        )
    )
    central_skin = np.clip(
        portrait_regions.central_face
        - feature_mask,
        0.0,
        1.0,
    )
    outer_face_skin = np.clip(
        portrait_regions.face_oval - portrait_regions.central_face - feature_mask,
        0.0,
        1.0,
    )
    damping = (
        0.62 * central_skin
        + 0.56 * outer_face_skin
        + 0.78 * portrait_regions.eyes
        + 0.52 * portrait_regions.nose
        + 0.72 * portrait_regions.mouth
    )
    return (1.0 - damping).clip(0.12, 1.0).astype(np.float32)

def _apply_portrait_surface_smoothing(
    relief_depth: np.ndarray,
    *,
    portrait_regions: PortraitRegionMasks,
    radius_px: float = 2.1,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return relief_depth.astype(np.float32)
    if portrait_regions.face_oval.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    smoothed = _smooth_unit_array(relief_depth, radius_px)
    face_mask = np.maximum(
        0.46 * portrait_regions.face_oval,
        0.54 * portrait_regions.central_face,
    )
    face_mask = np.maximum(face_mask, 0.62 * portrait_regions.eyes)
    face_mask = np.maximum(face_mask, 0.48 * portrait_regions.nose)
    face_mask = np.maximum(face_mask, 0.58 * portrait_regions.mouth)
    face_mask = face_mask.clip(0.0, 0.64).astype(np.float32)

    return (
        relief_depth.astype(np.float32) * (1.0 - face_mask)
        + smoothed.astype(np.float32) * face_mask
    ).clip(0.0, 1.0).astype(np.float32)

def _apply_portrait_face_pit_guard(
    relief_depth: np.ndarray,
    *,
    portrait_regions: PortraitRegionMasks,
    radius_px: float = 7.5,
    max_drop: float = 0.035,
    strength: float = 0.92,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return relief_depth.astype(np.float32)
    if portrait_regions.face_oval.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    face_mask = np.maximum(
        0.78 * portrait_regions.face_oval,
        0.86 * portrait_regions.central_face,
    )
    feature_preserve = np.maximum(0.92 * portrait_regions.eyes, 0.72 * portrait_regions.mouth)
    face_mask = (face_mask * (1.0 - feature_preserve)).clip(0.0, 0.86)
    if float(np.max(face_mask)) <= 0.0:
        return relief_depth.astype(np.float32)

    broad_face = _smooth_unit_array(relief_depth, radius_px)
    guarded = np.maximum(
        relief_depth.astype(np.float32),
        broad_face - float(np.clip(max_drop, 0.0, 1.0)),
    ).clip(0.0, 1.0)
    blend = (face_mask * float(np.clip(strength, 0.0, 1.0))).clip(0.0, 0.86)
    return (
        relief_depth.astype(np.float32) * (1.0 - blend)
        + guarded.astype(np.float32) * blend
    ).clip(0.0, 1.0).astype(np.float32)

def _apply_subject_surface_smoothing(
    relief_depth: np.ndarray,
    *,
    subject_mask: np.ndarray,
    radius_px: float = 2.3,
    strength: float = 0.55,
) -> np.ndarray:
    if relief_depth.size == 0 or subject_mask.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    smoothed = _smooth_unit_array(relief_depth, radius_px)
    structural_base = _guided_filter_self(
        relief_depth.astype(np.float32),
        radius=5,
        eps=0.025,
    )
    structural_edges = _normalized_gradient_magnitude(structural_base)
    edge_protection = _smoothstep_array(
        ((structural_edges - 0.22) / 0.45).clip(0.0, 1.0)
    )
    smoothing_mask = (
        subject_mask.astype(np.float32).clip(0.0, 1.0)
        * float(np.clip(strength, 0.0, 1.0))
        * (1.0 - edge_protection)
    )

    return (
        relief_depth.astype(np.float32) * (1.0 - smoothing_mask)
        + smoothed.astype(np.float32) * smoothing_mask
    ).clip(0.0, 1.0).astype(np.float32)
