from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

from .depth_filters import (
    _normalized_gradient_magnitude,
    _resize_unit_array,
    _smooth_unit_array,
)
from .portrait_regions import PortraitRegionMasks


def prepare_geometry_analysis_image(
    image: Image.Image,
    *,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks | None = None,
) -> Image.Image:
    """Build a geometry-only image that suppresses proof halos and texture noise."""
    rgb_image = image.convert("RGB")
    width, height = rgb_image.size
    mask = subject_mask.astype(np.float32).clip(0.0, 1.0)
    if mask.shape != (height, width):
        mask = _resize_unit_array(mask, (height, width))

    rgb = np.asarray(rgb_image, dtype=np.float32) / 255.0
    local_smooth = np.asarray(
        rgb_image.filter(ImageFilter.GaussianBlur(radius=1.35)),
        dtype=np.float32,
    ) / 255.0
    broad_radius = max(6.0, min(width, height) * 0.035)
    broad_smooth = np.asarray(
        rgb_image.filter(ImageFilter.GaussianBlur(radius=broad_radius)),
        dtype=np.float32,
    ) / 255.0

    background_pixels = rgb[mask < 0.08]
    if background_pixels.size:
        background_color = np.median(background_pixels, axis=0)
    else:
        background_color = np.median(rgb.reshape(-1, 3), axis=0)
    background_flat = 0.72 * background_color.reshape(1, 1, 3) + 0.28 * broad_smooth

    face_preserve = np.zeros((height, width), dtype=np.float32)
    if portrait_regions is not None and portrait_regions.face_oval.shape == mask.shape:
        face_preserve = np.maximum(face_preserve, 0.55 * portrait_regions.face_oval)
        face_preserve = np.maximum(face_preserve, 0.72 * portrait_regions.central_face)
        face_preserve = np.maximum(face_preserve, 0.90 * portrait_regions.eyes)
        face_preserve = np.maximum(face_preserve, 0.72 * portrait_regions.nose)
        face_preserve = np.maximum(face_preserve, 0.90 * portrait_regions.mouth)
        face_preserve = face_preserve.clip(0.0, 0.92)

    subject_keep = 0.52 + 0.42 * face_preserve
    subject_clean = rgb * subject_keep[..., None] + local_smooth * (
        1.0 - subject_keep[..., None]
    )

    boundary = _smooth_unit_array(_normalized_gradient_magnitude(mask), 1.6)
    boundary = boundary.clip(0.0, 0.85)
    composed = background_flat * (1.0 - mask[..., None]) + subject_clean * mask[..., None]
    composed = composed * (1.0 - boundary[..., None]) + local_smooth * boundary[..., None]

    return Image.fromarray((composed * 255.0).round().clip(0, 255).astype(np.uint8))
