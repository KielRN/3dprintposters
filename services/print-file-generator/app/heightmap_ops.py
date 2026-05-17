from __future__ import annotations

from typing import Literal

import numpy as np
from PIL import Image

from .depth_filters import _resize_float_array, _smoothstep_array
from .depth_types import Heightmap


def resize_heightmap_to_shape(
    heightmap: Heightmap,
    *,
    target_shape: tuple[int, int],
) -> Heightmap:
    target_rows, target_cols = target_shape
    if heightmap.values.shape == target_shape:
        return heightmap
    if target_rows < 2 or target_cols < 2:
        raise ValueError("Target heightmap shape must be at least 2x2")

    resized = _resize_float_array(heightmap.values, target_shape)
    resized = resized.clip(heightmap.min_height_mm, heightmap.max_height_mm)
    return Heightmap(
        values=resized.astype(np.float32),
        min_height_mm=float(np.min(resized)),
        max_height_mm=float(np.max(resized)),
        provider=heightmap.provider,
        provider_audit=heightmap.provider_audit,
        segmentation_status=heightmap.segmentation_status,
        face_analysis_status=heightmap.face_analysis_status,
        surface_intent_status=heightmap.surface_intent_status,
        debug_artifacts=heightmap.debug_artifacts,
    )

def apply_image_window_edge_fade(
    heightmap: Heightmap,
    *,
    fade_width_px: int | None = None,
) -> Heightmap:
    values = heightmap.values.astype(np.float32)
    if values.size == 0:
        return heightmap

    rows, cols = values.shape
    if rows < 3 or cols < 3:
        return heightmap

    width = fade_width_px
    if width is None:
        width = max(2, min(14, round(min(rows, cols) * 0.045)))
    width = int(width)
    if width <= 0:
        return heightmap

    edge_mask = _image_window_edge_mask(rows=rows, cols=cols, fade_width_px=width)
    floor = float(heightmap.min_height_mm)
    faded = floor + (values - floor) * edge_mask
    return Heightmap(
        values=faded.astype(np.float32),
        min_height_mm=float(np.min(faded)),
        max_height_mm=float(np.max(faded)),
        provider=heightmap.provider,
        provider_audit=heightmap.provider_audit,
        segmentation_status=heightmap.segmentation_status,
        face_analysis_status=heightmap.face_analysis_status,
        surface_intent_status=heightmap.surface_intent_status,
        debug_artifacts=heightmap.debug_artifacts,
    )

def _image_window_edge_mask(*, rows: int, cols: int, fade_width_px: int) -> np.ndarray:
    y_distance = np.minimum(np.arange(rows), np.arange(rows)[::-1])
    x_distance = np.minimum(np.arange(cols), np.arange(cols)[::-1])
    edge_distance = np.minimum(y_distance[:, None], x_distance[None, :]).astype(
        np.float32
    )
    progress = (edge_distance / max(float(fade_width_px), 1.0)).clip(0.0, 1.0)
    return _smoothstep_array(progress).astype(np.float32)

def heightmap_to_image_bytes(
    heightmap: Heightmap,
    *,
    bit_depth: Literal[8, 16] = 8,
) -> bytes:
    from .image_pipeline import image_to_png_bytes

    values = heightmap.values
    height_range = heightmap.max_height_mm - heightmap.min_height_mm
    if height_range <= 0:
        normalized_unit = np.zeros(values.shape, dtype=np.float32)
    else:
        normalized_unit = ((values - heightmap.min_height_mm) / height_range).clip(
            0.0,
            1.0,
        )

    if bit_depth == 16:
        normalized = (normalized_unit * 65535.0).round().astype(np.uint16)
        return image_to_png_bytes(Image.fromarray(normalized))

    normalized = (normalized_unit * 255.0).round().astype(np.uint8)
    return image_to_png_bytes(Image.fromarray(normalized))
