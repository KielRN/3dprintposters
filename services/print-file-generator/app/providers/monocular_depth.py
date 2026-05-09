"""Monocular depth provider role.

A `MonocularDepthProvider` produces an image-plane depth array for an
RGB image. Production candidates: Vertex AI (if it serves depth), HF
Inference (Depth Anything V2 hosted), Cloudflare-gatewayed equivalents.
v1 wires only a local-inference implementation for dev parity with the
existing experiments. The HF Inference and Vertex implementations are
stubs to be filled when the registry config layer lands.

Local inference (`LocalDepthAnythingV2Provider`) is dev-only — production
should not run torch/transformers in the print-file-generator service.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol

import numpy as np
from PIL import Image

from .base import AllProvidersFailedError, ProviderAudit, ProviderError


@dataclass(frozen=True)
class DepthResult:
    depth: np.ndarray
    """H x W float32. Provider-native depth values; not normalized to [0, 1]."""

    audit: ProviderAudit


class MonocularDepthProvider(Protocol):
    """A provider that produces an image-plane depth array from an RGB image."""

    @property
    def provider_id(self) -> str: ...

    @property
    def model_version(self) -> str: ...

    def infer_depth(self, image: Image.Image) -> DepthResult: ...


class LocalDepthAnythingV2Provider:
    """Runs Depth Anything V2 Small locally via transformers.pipeline().

    Dev/experiment use only. Production routes should not run torch in
    process; use HfInferenceDepthAnythingProvider or a Vertex-backed
    provider instead.
    """

    DEFAULT_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"

    def __init__(self, *, model: str = DEFAULT_MODEL) -> None:
        self._model = model

    @property
    def provider_id(self) -> str:
        return "local-depth-anything-v2-small"

    @property
    def model_version(self) -> str:
        return self._model

    def infer_depth(self, image: Image.Image) -> DepthResult:
        try:
            pipe = _depth_anything_v2_small_pipeline(self._model)
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(f"Local depth pipeline init failed: {exc}") from exc

        try:
            output = pipe(image)
        except Exception as exc:
            raise ProviderError(f"Local depth inference failed: {exc}") from exc

        depth = _extract_depth_from_pipeline_output(output)
        return DepthResult(
            depth=depth,
            audit=ProviderAudit(succeeded=self.provider_id),
        )


@lru_cache(maxsize=2)
def _depth_anything_v2_small_pipeline(model: str) -> Any:
    try:
        import torch
        from transformers import pipeline
    except ImportError as exc:
        raise ProviderError(
            "local-depth-anything-v2-small requires torch and transformers. "
            "Install the 'experiments' optional dependency or use an API-backed "
            "MonocularDepthProvider."
        ) from exc

    device = 0 if torch.cuda.is_available() else -1
    return pipeline(
        task="depth-estimation",
        model=model,
        device=device,
    )


def _extract_depth_from_pipeline_output(output: Any) -> np.ndarray:
    predicted_depth = output.get("predicted_depth")
    if predicted_depth is not None:
        if hasattr(predicted_depth, "detach"):
            predicted_depth = predicted_depth.detach().cpu().numpy()
        return np.squeeze(np.asarray(predicted_depth, dtype=np.float32))

    depth_image = output.get("depth")
    if depth_image is not None:
        return np.asarray(depth_image.convert("L"), dtype=np.float32) / 255.0

    raise ProviderError("Depth Anything output did not include a depth map.")


class HfInferenceDepthAnythingProvider:
    """Stub for HF Inference API hosted Depth Anything V2. Not yet implemented.

    Always raises ProviderError so a chain falls through. The stub exists
    so the registry config can name the provider today.
    """

    @property
    def provider_id(self) -> str:
        return "hf-inference-depth-anything"

    @property
    def model_version(self) -> str:
        return "hf:depth-anything/Depth-Anything-V2-Small-hf"

    def infer_depth(self, image: Image.Image) -> DepthResult:
        raise ProviderError(
            "HfInferenceDepthAnythingProvider is not yet implemented."
        )


class VertexDepthProvider:
    """Stub for Vertex AI monocular depth (if available). Not yet implemented."""

    @property
    def provider_id(self) -> str:
        return "vertex-depth"

    @property
    def model_version(self) -> str:
        return "vertex:tbd"

    def infer_depth(self, image: Image.Image) -> DepthResult:
        raise ProviderError("VertexDepthProvider is not yet implemented.")


class MonocularDepthChain:
    """Tries providers in order; falls through on ProviderError."""

    def __init__(self, providers: list[MonocularDepthProvider]) -> None:
        if not providers:
            raise ValueError("MonocularDepthChain requires at least one provider.")
        self._providers = list(providers)

    def infer_depth(self, image: Image.Image) -> DepthResult:
        attempted: list[str] = []
        last_error: BaseException | None = None
        last_reason: str | None = None

        for provider in self._providers:
            try:
                result = provider.infer_depth(image)
            except ProviderError as exc:
                attempted.append(provider.provider_id)
                last_error = exc
                last_reason = str(exc)
                continue

            audit = ProviderAudit(
                succeeded=provider.provider_id,
                attempted=tuple(attempted),
                fallback_reason=last_reason if attempted else None,
            )
            return DepthResult(depth=result.depth, audit=audit)

        raise AllProvidersFailedError(attempted, last_error)


def create_default_depth_chain() -> MonocularDepthChain:
    """Default chain: local Depth Anything V2 Small.

    Dev/experiment-shape only. Production chains will be:
        [VertexDepthProvider, HfInferenceDepthAnythingProvider]
    once those implementations land. The local provider stays available
    as a development fallback under the experiments extra.
    """
    return MonocularDepthChain([LocalDepthAnythingV2Provider()])
