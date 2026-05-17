from __future__ import annotations

import numpy as np
from PIL import Image

from .depth_types import SurfaceIntentMasks
from .portrait_regions import PortraitRegionMasks


def _hybrid_debug_artifacts(
    *,
    geometry_image: Image.Image,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks,
    surface_intent: SurfaceIntentMasks,
    semantic_base: np.ndarray,
    detail_layer: np.ndarray,
    detail_weight_map: np.ndarray,
    blended: np.ndarray,
    relief_depth: np.ndarray,
) -> dict[str, bytes]:
    from .image_pipeline import image_to_png_bytes

    return {
        "geometry-input.png": image_to_png_bytes(geometry_image.convert("RGB")),
        "subject-mask.png": _debug_unit_array_png_bytes(subject_mask),
        "portrait-face-oval-mask.png": _debug_unit_array_png_bytes(
            portrait_regions.face_oval
        ),
        "portrait-central-face-mask.png": _debug_unit_array_png_bytes(
            portrait_regions.central_face
        ),
        "portrait-nose-mask.png": _debug_unit_array_png_bytes(portrait_regions.nose),
        "surface-intent-smooth-mask.png": _debug_unit_array_png_bytes(
            surface_intent.smooth_mask
        ),
        "surface-intent-crisp-mask.png": _debug_unit_array_png_bytes(
            surface_intent.crisp_mask
        ),
        "surface-intent-texture-mask.png": _debug_unit_array_png_bytes(
            surface_intent.texture_mask
        ),
        "surface-intent-smoothing-mask.png": _debug_unit_array_png_bytes(
            surface_intent.smoothing_mask
        ),
        "surface-intent-detail-weight-map.png": _debug_unit_array_png_bytes(
            surface_intent.detail_weight_map
        ),
        "portrait-detail-weight-map.png": _debug_unit_array_png_bytes(
            detail_weight_map
        ),
        "semantic-base.png": _debug_unit_array_png_bytes(semantic_base),
        "detail-layer.png": _debug_signed_array_png_bytes(detail_layer),
        "blended-depth.png": _debug_unit_array_png_bytes(blended),
        "relief-depth.png": _debug_unit_array_png_bytes(relief_depth),
    }

def _debug_unit_array_png_bytes(values: np.ndarray) -> bytes:
    from .image_pipeline import image_to_png_bytes

    unit = values.astype(np.float32)
    if unit.size == 0:
        unit = np.zeros((1, 1), dtype=np.float32)
    unit = unit.clip(0.0, 1.0)
    return image_to_png_bytes(
        Image.fromarray((unit * 255.0).round().astype(np.uint8), mode="L")
    )

def _debug_signed_array_png_bytes(values: np.ndarray) -> bytes:
    unit = (values.astype(np.float32).clip(-1.0, 1.0) + 1.0) * 0.5
    return _debug_unit_array_png_bytes(unit)
