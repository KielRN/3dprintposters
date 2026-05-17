from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from .providers.base import ProviderAudit


POSTER_RELIEF_BANDS = 9
BASE_SMOOTH_RADIUS_PX = 2.0
TERRACE_SMOOTH_RADIUS_PX = 0.7
EDGE_SMOOTH_RADIUS_PX = 1.1
EDGE_DETAIL_WEIGHT = 0.18
HeightmapProviderName = Literal[
    "posterized_luminance",
    "continuous_luminance",
    "lithophane_baseline",
    "depth_anything_v2_small",
    "depth_anything_v2_small_bas_relief",
    "segformer_masked_depth",
    "masked_depth_detail_blend",
    "triposr_sidecar",
]


@dataclass(frozen=True)
class Heightmap:
    values: np.ndarray
    min_height_mm: float
    max_height_mm: float
    provider: str
    provider_audit: dict[str, dict[str, object]] | None = None
    segmentation_status: dict[str, object] | None = None
    face_analysis_status: dict[str, object] | None = None
    surface_intent_status: dict[str, object] | None = None
    debug_artifacts: dict[str, bytes] | None = None


@dataclass(frozen=True)
class DepthInferenceResult:
    depth: np.ndarray
    audit: ProviderAudit | None = None


@dataclass(frozen=True)
class SubjectMaskResult:
    mask: np.ndarray
    status: Literal["ok", "empty_mask", "full_image_mask", "api_failure"]
    audit: ProviderAudit | None = None
    mask_coverage: float = 0.0
    foreground_labels: tuple[str, ...] = ()
    raw_segment_count: int = 0


@dataclass(frozen=True)
class SurfaceIntentMasks:
    smooth_mask: np.ndarray
    crisp_mask: np.ndarray
    texture_mask: np.ndarray
    smoothing_mask: np.ndarray
    detail_weight_map: np.ndarray
    background_mask: np.ndarray
    metadata: dict[str, object]
