from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

from .depth_types import EDGE_SMOOTH_RADIUS_PX


def _image_to_unit_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image, dtype=np.float32) / 255.0

def _apply_tone_curve(values: np.ndarray, *, contrast: float, gamma: float) -> np.ndarray:
    contrasted = ((values - 0.5) * contrast + 0.5).clip(0.0, 1.0)
    return np.power(contrasted, gamma).clip(0.0, 1.0)

def _normalized_edge_detail(grayscale: Image.Image) -> np.ndarray:
    edge_detail = _image_to_unit_array(
        grayscale.filter(ImageFilter.FIND_EDGES).filter(
            ImageFilter.GaussianBlur(radius=EDGE_SMOOTH_RADIUS_PX)
        )
    )
    return edge_detail / max(float(np.max(edge_detail)), 1e-6)

def _smooth_unit_array(values: np.ndarray, radius_px: float) -> np.ndarray:
    if radius_px <= 0:
        return values.clip(0.0, 1.0)

    kernel = _gaussian_kernel(radius_px)
    padding = len(kernel) // 2
    padded_x = np.pad(
        values.astype(np.float32),
        ((0, 0), (padding, padding)),
        mode="edge",
    )
    smoothed_x = np.apply_along_axis(
        lambda row: np.convolve(row, kernel, mode="valid"),
        axis=1,
        arr=padded_x,
    )
    padded_y = np.pad(smoothed_x, ((padding, padding), (0, 0)), mode="edge")
    smoothed = np.apply_along_axis(
        lambda column: np.convolve(column, kernel, mode="valid"),
        axis=0,
        arr=padded_y,
    )
    return smoothed.astype(np.float32).clip(0.0, 1.0)

def _resize_float_array(values: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    target_rows, target_cols = target_shape
    if values.shape == target_shape:
        return values.astype(np.float32)

    resampling = getattr(Image, "Resampling", Image).BICUBIC
    image = Image.fromarray(values.astype(np.float32), mode="F")
    resized = image.resize((target_cols, target_rows), resampling)
    return np.asarray(resized, dtype=np.float32)

def _resize_unit_array(values: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    resized = _resize_float_array(values.astype(np.float32), target_shape)
    return resized.clip(0.0, 1.0).astype(np.float32)

def _normalize_depth(values: np.ndarray) -> np.ndarray:
    finite_values = values[np.isfinite(values)]
    if finite_values.size == 0:
        raise ValueError("Depth Anything returned no finite depth values")

    low, high = np.percentile(finite_values, [2.0, 98.0])
    if high - low <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return ((values.astype(np.float32) - low) / (high - low)).clip(0.0, 1.0)

def _normalize_unit_array(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values.astype(np.float32)

    finite_values = values[np.isfinite(values)]
    if finite_values.size == 0:
        return np.zeros(values.shape, dtype=np.float32)

    low = float(np.min(finite_values))
    high = float(np.max(finite_values))
    if high - low <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return ((values.astype(np.float32) - low) / (high - low)).clip(0.0, 1.0)

def _normalized_gradient_magnitude(values: np.ndarray) -> np.ndarray:
    gradient_y, gradient_x = np.gradient(values.astype(np.float32))
    magnitude = np.sqrt(gradient_x * gradient_x + gradient_y * gradient_y)
    finite = magnitude[np.isfinite(magnitude)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)

    scale = float(np.percentile(finite, 96.0))
    if scale <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return (magnitude / scale).clip(0.0, 1.0).astype(np.float32)

def _smoothstep_array(values: np.ndarray) -> np.ndarray:
    return values * values * (3.0 - 2.0 * values)


def _box_filter(arr: np.ndarray, radius: int) -> np.ndarray:
    """Mean of a (2*radius+1)x(2*radius+1) box, edge-padded.

    Implemented via a summed-area table for O(N) cost regardless of radius.
    """
    if radius < 1:
        return arr.astype(np.float32)

    h, w = arr.shape
    padded = np.pad(arr.astype(np.float64), radius, mode="edge")
    sat = np.zeros((padded.shape[0] + 1, padded.shape[1] + 1), dtype=np.float64)
    sat[1:, 1:] = np.cumsum(np.cumsum(padded, axis=0), axis=1)

    size = 2 * radius + 1
    box_sum = (
        sat[size : size + h, size : size + w]
        - sat[0:h, size : size + w]
        - sat[size : size + h, 0:w]
        + sat[0:h, 0:w]
    )
    return (box_sum / (size * size)).astype(np.float32)

def _guided_filter_self(
    depth: np.ndarray, *, radius: int = 15, eps: float = 0.01
) -> np.ndarray:
    """Self-guided edge-preserving smoothing (He, Sun, Tang 2010).

    Returns the base layer for detail/base separation: a smoothed version
    of ``depth`` that preserves strong edges while flattening locally.
    """
    d = depth.astype(np.float32)

    mean = _box_filter(d, radius)
    mean_sq = _box_filter(d * d, radius)
    var = mean_sq - mean * mean

    a = var / (var + eps)
    b = mean - a * mean

    mean_a = _box_filter(a, radius)
    mean_b = _box_filter(b, radius)

    return (mean_a * d + mean_b).astype(np.float32)

def _apply_bas_relief_transform(
    depth: np.ndarray,
    compression_strength: float = 0.75,
    *,
    radius: int = 15,
    eps: float = 0.01,
    detail_boost: float = 1.5,
) -> np.ndarray:
    """Bas-relief compression via guided-filter detail/base separation.

    The depth is decomposed into a low-frequency *base* (global shape)
    and a high-frequency *detail* layer. The base is compressed into a
    target range; detail is preserved or amplified. Together they form
    a relief that fits a shallow printable Z range while keeping local
    feature definition. Maps Durand & Dorsey 2002 HDR tone mapping onto
    depth in place of log luminance.

    Replaces the previous gradient-attenuation transform, which was
    structurally a no-op for almost every pixel (compression_factor was
    dominated by silhouette-edge gradients and stayed near 1.0
    everywhere else).

    Args:
        depth: Unit-normalized [0, 1] depth array.
        compression_strength: How aggressively to compress global range.
            Higher = flatter base. Mapped to ``base_target_range =
            clip(1.0 - compression_strength, 0.1, 1.0)``. Default 0.75
            yields a base spanning 0.25 of the [0, 1] range.
        radius: Guided filter window radius in pixels. Roughly the
            scale at which features count as "detail" vs. "base".
        eps: Guided filter regularization. Larger = smoother base, more
            edge bleed. 0.01 is a reasonable default for depth in [0, 1].
        detail_boost: Multiplier on the detail layer. 1.0 preserves;
            >1.0 amplifies local features.

    Returns:
        Relief depth in [0, 1].
    """
    if depth.size == 0:
        return depth

    target_range = float(np.clip(1.0 - compression_strength, 0.1, 1.0))

    base = _guided_filter_self(depth.astype(np.float32), radius=radius, eps=eps)
    detail = depth.astype(np.float32) - base

    base_min = float(np.min(base))
    base_max = float(np.max(base))
    base_span = max(base_max - base_min, 1e-6)
    base_unit = (base - base_min) / base_span
    base_compressed = base_unit * target_range + (1.0 - target_range) / 2.0

    relief = base_compressed + detail_boost * detail
    return relief.clip(0.0, 1.0).astype(np.float32)

def _gaussian_kernel(radius_px: float) -> np.ndarray:
    half_width = max(1, int(np.ceil(radius_px * 3.0)))
    offsets = np.arange(-half_width, half_width + 1, dtype=np.float32)
    kernel = np.exp(-(offsets * offsets) / (2.0 * radius_px * radius_px))
    return kernel / np.sum(kernel)

def _depth_to_heights(
    printable_depth: np.ndarray,
    *,
    base_thickness_mm: float,
    min_relief_mm: float,
    max_relief_mm: float,
) -> np.ndarray:
    relief = min_relief_mm + printable_depth * (max_relief_mm - min_relief_mm)
    return base_thickness_mm + relief
