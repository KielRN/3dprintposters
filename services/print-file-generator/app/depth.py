"""Public depth/heightmap facade.

The implementation is split across smaller modules so relief-quality work can
focus on one responsibility at a time. Import from the focused modules for new
internal code; this facade keeps the existing service API stable.
"""

# ruff: noqa: F401

from __future__ import annotations

from .depth_debug import _debug_signed_array_png_bytes, _debug_unit_array_png_bytes
from .depth_filters import (
    _apply_bas_relief_transform,
    _apply_tone_curve,
    _box_filter,
    _depth_to_heights,
    _gaussian_kernel,
    _guided_filter_self,
    _image_to_unit_array,
    _normalize_depth,
    _normalize_unit_array,
    _normalized_edge_detail,
    _normalized_gradient_magnitude,
    _resize_float_array,
    _resize_unit_array,
    _smooth_unit_array,
    _smoothstep_array,
)
from .depth_inference import (
    _get_depth_chain,
    _infer_depth_anything_v2_small,
    _infer_depth_anything_v2_small_result,
)
from .depth_providers import (
    ContinuousLuminanceDepthProvider,
    DepthAnythingV2SmallBasReliefProvider,
    DepthAnythingV2SmallDepthProvider,
    LithophaneBaselineDepthProvider,
    LuminanceDepthProvider,
    MaskedDepthDetailBlendProvider,
    SegformerMaskedDepthProvider,
    TripoSRSidecarProvider,
    _compose_lithophane_blend_weight_map,
    _deterministic_detail_unit,
    _extract_subject_detail_layer,
    _provider_audit_map,
    _segmentation_status_to_dict,
    get_depth_provider,
)
from .depth_types import (
    BASE_SMOOTH_RADIUS_PX,
    EDGE_DETAIL_WEIGHT,
    EDGE_SMOOTH_RADIUS_PX,
    POSTER_RELIEF_BANDS,
    TERRACE_SMOOTH_RADIUS_PX,
    DepthInferenceResult,
    Heightmap,
    HeightmapProviderName,
    SubjectMaskResult,
    SurfaceIntentMasks,
)
from .experimental.triposr_sidecar import (
    _get_tripo_api_key,
    _infer_triposr_api,
    _project_mesh_to_depth,
    _tripo_headers,
)
from .geometry_input import prepare_geometry_analysis_image
from .heightmap_ops import (
    _image_window_edge_mask,
    apply_image_window_edge_fade,
    heightmap_to_image_bytes,
    resize_heightmap_to_shape,
)
from .portrait_regions import analyze_portrait_regions
from .portrait_relief import (
    _apply_portrait_face_pit_guard,
    _apply_portrait_surface_smoothing,
    _apply_subject_surface_smoothing,
    _portrait_detail_weight_map,
)
from .segmentation_masks import (
    _generate_subject_mask,
    _generate_subject_mask_result,
    _get_segmentation_chain,
    _smooth_subject_mask_contour,
)
from .surface_intent import (
    _apply_graphic_emboss_layer,
    _apply_surface_intent_smoothing,
    _compose_surface_detail_weight_map,
    _graphic_emboss_mask,
    _infer_surface_intent_masks,
    _portrait_surface_intent_mask,
    _soft_rect_mask,
    _surface_mask_summary,
    _surface_policy_id,
    _surface_policy_requests_texture,
    _surface_roughness_metrics,
)
