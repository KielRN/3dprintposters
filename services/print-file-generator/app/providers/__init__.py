"""AI provider registry for the print-file-generator service.

Mirrors the pattern in apps/functions/src/aiProvider.ts: each role
(subject segmentation, monocular depth, ...) has a typed interface,
multiple implementations, and a chain that tries providers in order
and records the fallback path.

The current product path uses local Depth Anything V2 inference for
monocular depth and HF Inference SegFormer for subject segmentation.
API-backed depth providers can replace local inference when they are
implemented and verified against the product workflow.

Public exports:
    AllProvidersFailedError, ProviderError, ProviderAudit
    SubjectSegmentationProvider, SubjectSegmentationChain, SegmentationResult
    MonocularDepthProvider, MonocularDepthChain, DepthResult
    create_default_segmentation_chain, create_default_depth_chain
"""

from .base import (
    AllProvidersFailedError,
    ProviderAudit,
    ProviderError,
)
from .monocular_depth import (
    DepthResult,
    HfInferenceDepthAnythingProvider,
    LocalDepthAnythingV2Provider,
    MonocularDepthChain,
    MonocularDepthProvider,
    VertexDepthProvider,
    create_default_depth_chain,
)
from .segmentation import (
    CloudflareGatewaySegmentationProvider,
    HfInferenceSegmentationProvider,
    SegmentationResult,
    SubjectSegmentationChain,
    SubjectSegmentationProvider,
    VertexSegmentationProvider,
    create_default_segmentation_chain,
)

__all__ = [
    "AllProvidersFailedError",
    "CloudflareGatewaySegmentationProvider",
    "DepthResult",
    "HfInferenceDepthAnythingProvider",
    "HfInferenceSegmentationProvider",
    "LocalDepthAnythingV2Provider",
    "MonocularDepthChain",
    "MonocularDepthProvider",
    "ProviderAudit",
    "ProviderError",
    "SegmentationResult",
    "SubjectSegmentationChain",
    "SubjectSegmentationProvider",
    "VertexDepthProvider",
    "VertexSegmentationProvider",
    "create_default_depth_chain",
    "create_default_segmentation_chain",
]
