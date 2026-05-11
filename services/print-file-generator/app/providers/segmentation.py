"""Subject segmentation provider role.

A `SubjectSegmentationProvider` produces a foreground/subject mask for an
RGB image. Production candidates: Vertex AI Vision, HF Inference SegFormer,
Cloudflare-gatewayed segmentation. v1 wires only the HF Inference path;
Vertex and Cloudflare-gateway providers are stubs to be filled when the
registry config layer lands.

Post-processing (Gaussian edge blur, full-image fallback) is intentionally
left to the caller. Providers return the raw merged foreground mask;
callers shape it to their needs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from PIL import Image

from .base import AllProvidersFailedError, ProviderAudit, ProviderError


@dataclass(frozen=True)
class SegmentationResult:
    mask: np.ndarray
    """H x W float32 in [0, 1]. 1.0 = subject, 0.0 = background."""

    foreground_labels: tuple[str, ...]
    """Labels treated as foreground after merging."""

    raw_segments: tuple[dict[str, Any], ...]
    """Provider's raw segment list (label, score, mask info)."""

    audit: ProviderAudit


class SubjectSegmentationProvider(Protocol):
    """A provider that produces a subject mask from an RGB image."""

    @property
    def provider_id(self) -> str: ...

    @property
    def model_version(self) -> str: ...

    def segment(self, image: Image.Image) -> SegmentationResult: ...


_DEFAULT_BACKGROUND_LABELS = frozenset(
    {
        "wall",
        "ceiling",
        "floor",
        "sky",
        "earth",
        "grass",
        "road",
        "sidewalk",
        "pavement",
        "building",
        "fence",
        "sea",
        "water",
        "mountain",
        "tree",
        "plant",
        "field",
        "sand",
    }
)


class HfInferenceSegmentationProvider:
    """SegFormer / ADE20K via the Hugging Face Inference API."""

    DEFAULT_MODEL = "nvidia/segformer-b0-finetuned-ade-512-512"
    DEFAULT_BASE_URL = "https://router.huggingface.co/hf-inference/models/"

    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        background_labels: frozenset[str] = _DEFAULT_BACKGROUND_LABELS,
        timeout_seconds: float = 120.0,
    ) -> None:
        self._model = model
        self._background_labels = background_labels
        self._timeout = timeout_seconds

    @property
    def provider_id(self) -> str:
        return "hf-inference-segformer"

    @property
    def model_version(self) -> str:
        return self._model

    def segment(self, image: Image.Image) -> SegmentationResult:
        try:
            segments = self._call_api(image)
        except ProviderError:
            raise
        except Exception as exc:  # network errors, decoding errors
            raise ProviderError(f"HF Inference segmentation failed: {exc}") from exc

        w, h = image.size
        if not segments:
            return SegmentationResult(
                mask=np.ones((h, w), dtype=np.float32),
                foreground_labels=(),
                raw_segments=(),
                audit=ProviderAudit(
                    succeeded=self.provider_id,
                    model_version=self.model_version,
                ),
            )

        combined = np.zeros((h, w), dtype=np.float32)
        foreground: list[str] = []
        for seg in segments:
            label = str(seg.get("label", "")).lower()
            if label in self._background_labels:
                continue
            mask_b64 = seg.get("mask")
            if not mask_b64:
                continue

            mask_img = self._decode_mask(mask_b64)
            if mask_img.size != (w, h):
                mask_img = mask_img.resize((w, h), Image.BILINEAR)
            mask_arr = np.asarray(mask_img.convert("L"), dtype=np.float32) / 255.0
            combined = np.maximum(combined, mask_arr)
            foreground.append(label)

        return SegmentationResult(
            mask=combined.clip(0.0, 1.0).astype(np.float32),
            foreground_labels=tuple(foreground),
            raw_segments=tuple(segments),
            audit=ProviderAudit(
                succeeded=self.provider_id,
                model_version=self.model_version,
            ),
        )

    def _call_api(self, image: Image.Image) -> list[dict[str, Any]]:
        import io
        import os

        try:
            import requests
        except ImportError as exc:
            raise ProviderError(
                "hf-inference-segformer requires the 'requests' package."
            ) from exc

        token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
        if not token:
            try:
                from dotenv import load_dotenv

                _root_env = os.path.normpath(
                    os.path.join(
                        os.path.dirname(__file__),
                        os.pardir,
                        os.pardir,
                        os.pardir,
                        os.pardir,
                        ".env",
                    )
                )
                load_dotenv(_root_env)
                token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get(
                    "HF_TOKEN"
                )
            except ImportError:
                pass

        if not token:
            raise ProviderError(
                "hf-inference-segformer requires a Hugging Face API key. "
                "Set HUGGINGFACE_API_KEY or HF_TOKEN."
            )

        buf = io.BytesIO()
        image.save(buf, format="PNG")
        url = f"{self.DEFAULT_BASE_URL}{self._model}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "image/png",
        }
        resp = requests.post(
            url, headers=headers, data=buf.getvalue(), timeout=self._timeout
        )
        if resp.status_code != 200:
            raise ProviderError(
                f"HF Inference API returned {resp.status_code}: {resp.text[:300]}"
            )
        return resp.json()

    @staticmethod
    def _decode_mask(mask_b64: str) -> Image.Image:
        import base64
        import io

        return Image.open(io.BytesIO(base64.b64decode(mask_b64))).convert("L")


class VertexSegmentationProvider:
    """Stub for Vertex AI Vision segmentation. Not yet implemented.

    Always raises ProviderError so a chain falls through to the next
    provider. The stub exists so the registry config can name the provider
    today; the implementation lands when the Vertex API surface and IAM
    setup are settled.
    """

    @property
    def provider_id(self) -> str:
        return "vertex-vision-segmentation"

    @property
    def model_version(self) -> str:
        return "vertex:tbd"

    def segment(self, image: Image.Image) -> SegmentationResult:
        raise ProviderError(
            "VertexSegmentationProvider is not yet implemented."
        )


class CloudflareGatewaySegmentationProvider:
    """Stub for Cloudflare AI Gateway segmentation route. Not yet implemented."""

    @property
    def provider_id(self) -> str:
        return "cloudflare-gateway-segmentation"

    @property
    def model_version(self) -> str:
        return "cloudflare-gateway:tbd"

    def segment(self, image: Image.Image) -> SegmentationResult:
        raise ProviderError(
            "CloudflareGatewaySegmentationProvider is not yet implemented."
        )


class SubjectSegmentationChain:
    """Tries providers in order; falls through on ProviderError."""

    def __init__(self, providers: list[SubjectSegmentationProvider]) -> None:
        if not providers:
            raise ValueError(
                "SubjectSegmentationChain requires at least one provider."
            )
        self._providers = list(providers)

    def segment(self, image: Image.Image) -> SegmentationResult:
        attempted: list[str] = []
        last_error: BaseException | None = None
        last_reason: str | None = None

        for provider in self._providers:
            try:
                result = provider.segment(image)
            except ProviderError as exc:
                attempted.append(provider.provider_id)
                last_error = exc
                last_reason = str(exc)
                continue

            audit = ProviderAudit(
                succeeded=provider.provider_id,
                attempted=tuple(attempted),
                fallback_reason=last_reason if attempted else None,
                model_version=provider.model_version,
            )
            return SegmentationResult(
                mask=result.mask,
                foreground_labels=result.foreground_labels,
                raw_segments=result.raw_segments,
                audit=audit,
            )

        raise AllProvidersFailedError(attempted, last_error)


def create_default_segmentation_chain() -> SubjectSegmentationChain:
    """Default chain: HF Inference SegFormer only.

    Vertex and Cloudflare-gateway providers exist as stubs but are not yet
    wired in. Production routing will be driven by registry config in
    Firestore (or typed config under infra/firebase/).
    """
    return SubjectSegmentationChain([HfInferenceSegmentationProvider()])
