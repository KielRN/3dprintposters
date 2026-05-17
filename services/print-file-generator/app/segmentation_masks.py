from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageFilter

from .depth_filters import _smoothstep_array
from .depth_types import SubjectMaskResult


@lru_cache(maxsize=1)
def _get_segmentation_chain() -> Any:
    from .providers import create_default_segmentation_chain

    return create_default_segmentation_chain()

def _generate_subject_mask(
    image: Image.Image,
    *,
    blur_radius_px: float = 5.0,
    full_image_threshold: float = 0.90,
) -> np.ndarray:
    """Soft subject mask via the configured segmentation provider chain.

    Thin shim over ``app.providers.SubjectSegmentationChain``. Adds the
    heightmap-specific post-processing (full-image fallback, Gaussian
    edge blur) on top of the provider's raw mask.

    Returns a float32 array in [0, 1] matching the image dimensions,
    where 1.0 = subject and 0.0 = background.
    """
    return _generate_subject_mask_result(
        image,
        blur_radius_px=blur_radius_px,
        full_image_threshold=full_image_threshold,
    ).mask

def _generate_subject_mask_result(
    image: Image.Image,
    *,
    blur_radius_px: float = 5.0,
    full_image_threshold: float = 0.90,
) -> SubjectMaskResult:
    chain = _get_segmentation_chain()
    result = chain.segment(image)

    raw_mask = result.mask

    w, h = image.size
    total_pixels = w * h
    mask_area = float(np.sum(raw_mask > 0.5))
    mask_coverage = mask_area / total_pixels if total_pixels > 0 else 0.0

    no_segments = not result.foreground_labels and not result.raw_segments
    status: Literal["ok", "empty_mask", "full_image_mask", "api_failure"] = "ok"
    if no_segments or mask_area == 0:
        raise ValueError(
            "Subject segmentation returned no usable foreground mask for "
            "masked_depth_detail_blend."
        )

    if mask_coverage > full_image_threshold:
        status = "full_image_mask"
        return SubjectMaskResult(
            mask=np.ones((h, w), dtype=np.float32),
            status=status,
            audit=result.audit,
            mask_coverage=mask_coverage,
            foreground_labels=result.foreground_labels,
            raw_segment_count=len(result.raw_segments),
        )

    if blur_radius_px > 0:
        return SubjectMaskResult(
            mask=_smooth_subject_mask_contour(
                raw_mask,
                feather_radius_px=blur_radius_px,
            ),
            status=status,
            audit=result.audit,
            mask_coverage=mask_coverage,
            foreground_labels=result.foreground_labels,
            raw_segment_count=len(result.raw_segments),
        )

    return SubjectMaskResult(
        mask=raw_mask.clip(0.0, 1.0).astype(np.float32),
        status=status,
        audit=result.audit,
        mask_coverage=mask_coverage,
        foreground_labels=result.foreground_labels,
        raw_segment_count=len(result.raw_segments),
    )

def _smooth_subject_mask_contour(
    raw_mask: np.ndarray,
    *,
    feather_radius_px: float,
) -> np.ndarray:
    """Smooth blocky segmentation contours and return a feathered subject mask."""
    mask = raw_mask.astype(np.float32).clip(0.0, 1.0)
    if mask.size == 0:
        return mask

    binary = mask > 0.5
    if np.all(binary):
        return np.ones(mask.shape, dtype=np.float32)
    if not np.any(binary):
        return np.zeros(mask.shape, dtype=np.float32)

    try:
        import cv2

        radius = max(1, min(9, int(round(feather_radius_px * 0.45))))
        kernel_size = radius * 2 + 1
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (kernel_size, kernel_size),
        )
        binary_u8 = (binary.astype(np.uint8) * 255)
        closed = cv2.morphologyEx(binary_u8, cv2.MORPH_CLOSE, kernel)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel)
        inside = cv2.distanceTransform(opened, cv2.DIST_L2, 3)
        outside = cv2.distanceTransform(255 - opened, cv2.DIST_L2, 3)
        signed_distance = inside - outside
        feather = max(1.0, float(feather_radius_px))
        soft = ((signed_distance + feather) / (2.0 * feather)).clip(0.0, 1.0)
        return _smoothstep_array(soft).astype(np.float32)
    except Exception:
        mask_img = Image.fromarray((mask * 255).round().astype(np.uint8), mode="L")
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=feather_radius_px))
        return (np.asarray(mask_img, dtype=np.float32) / 255.0).clip(0.0, 1.0)
