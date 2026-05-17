from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image

from .depth_types import DepthInferenceResult


def _infer_depth_anything_v2_small(image: Image.Image) -> np.ndarray:
    """Depth array via the configured monocular-depth provider chain.

    Thin shim over ``app.providers.MonocularDepthChain``.
    """
    return _infer_depth_anything_v2_small_result(image).depth

def _infer_depth_anything_v2_small_result(image: Image.Image) -> DepthInferenceResult:
    """Depth array and provider audit via the configured provider chain."""
    chain = _get_depth_chain()
    result = chain.infer_depth(image)
    return DepthInferenceResult(depth=result.depth, audit=result.audit)


@lru_cache(maxsize=1)
def _get_depth_chain() -> Any:
    from .providers import create_default_depth_chain

    return create_default_depth_chain()
