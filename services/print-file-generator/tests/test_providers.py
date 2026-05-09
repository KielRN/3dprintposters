"""Tests for app.providers — chain failover and per-provider audit."""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import numpy as np
import pytest
from PIL import Image

from app.providers import (
    AllProvidersFailedError,
    CloudflareGatewaySegmentationProvider,
    HfInferenceSegmentationProvider,
    ProviderError,
    SegmentationResult,
    SubjectSegmentationChain,
    VertexSegmentationProvider,
)
from app.providers.base import ProviderAudit


@dataclass
class _StubProvider:
    """Test double for SubjectSegmentationProvider."""

    provider_id: str
    model_version: str = "stub:v1"
    raises: BaseException | None = None
    mask_value: float = 1.0

    def segment(self, image: Image.Image) -> SegmentationResult:
        if self.raises is not None:
            raise self.raises
        w, h = image.size
        mask = np.full((h, w), self.mask_value, dtype=np.float32)
        return SegmentationResult(
            mask=mask,
            foreground_labels=("person",),
            raw_segments=(),
            audit=ProviderAudit(succeeded=self.provider_id),
        )


def _white_image(width: int = 6, height: int = 6) -> Image.Image:
    return Image.new("RGB", (width, height), "white")


def test_chain_single_provider_first_try_success() -> None:
    chain = SubjectSegmentationChain([_StubProvider("a", mask_value=0.7)])
    result = chain.segment(_white_image())

    assert result.audit.succeeded == "a"
    assert result.audit.attempted == ()
    assert result.audit.fallback_reason is None
    assert float(result.mask[0, 0]) == pytest.approx(0.7)


def test_chain_falls_through_on_provider_error() -> None:
    chain = SubjectSegmentationChain(
        [
            _StubProvider("primary", raises=ProviderError("api 503")),
            _StubProvider("secondary", mask_value=0.5),
        ]
    )
    result = chain.segment(_white_image())

    assert result.audit.succeeded == "secondary"
    assert result.audit.attempted == ("primary",)
    assert result.audit.fallback_reason == "api 503"


def test_chain_records_full_attempted_list() -> None:
    chain = SubjectSegmentationChain(
        [
            _StubProvider("a", raises=ProviderError("a-fail")),
            _StubProvider("b", raises=ProviderError("b-fail")),
            _StubProvider("c", mask_value=1.0),
        ]
    )
    result = chain.segment(_white_image())

    assert result.audit.succeeded == "c"
    assert result.audit.attempted == ("a", "b")
    assert result.audit.fallback_reason == "b-fail"


def test_chain_raises_when_all_fail() -> None:
    chain = SubjectSegmentationChain(
        [
            _StubProvider("a", raises=ProviderError("a-fail")),
            _StubProvider("b", raises=ProviderError("b-fail")),
        ]
    )
    with pytest.raises(AllProvidersFailedError) as exc_info:
        chain.segment(_white_image())

    assert exc_info.value.attempted == ["a", "b"]
    assert "b-fail" in repr(exc_info.value.last_error)


def test_chain_does_not_swallow_unexpected_exceptions() -> None:
    """Plain Exception (not ProviderError) means programmer bug — propagate."""
    chain = SubjectSegmentationChain(
        [
            _StubProvider("a", raises=ValueError("not a recoverable provider error")),
            _StubProvider("b", mask_value=1.0),
        ]
    )
    with pytest.raises(ValueError):
        chain.segment(_white_image())


def test_chain_rejects_empty_provider_list() -> None:
    with pytest.raises(ValueError):
        SubjectSegmentationChain([])


def test_vertex_segmentation_stub_raises_provider_error() -> None:
    with pytest.raises(ProviderError):
        VertexSegmentationProvider().segment(_white_image())


def test_cloudflare_gateway_segmentation_stub_raises_provider_error() -> None:
    with pytest.raises(ProviderError):
        CloudflareGatewaySegmentationProvider().segment(_white_image())


def test_chain_skips_stubs_and_uses_concrete_implementation() -> None:
    """Real-world default shape: stubs raise ProviderError; chain falls to concrete."""
    chain = SubjectSegmentationChain(
        [
            VertexSegmentationProvider(),
            CloudflareGatewaySegmentationProvider(),
            _StubProvider("hf-inference-segformer", mask_value=1.0),
        ]
    )
    result = chain.segment(_white_image())

    assert result.audit.succeeded == "hf-inference-segformer"
    assert result.audit.attempted == (
        "vertex-vision-segmentation",
        "cloudflare-gateway-segmentation",
    )


def _encoded_white_mask(width: int, height: int) -> str:
    pil = Image.new("L", (width, height), 255)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_hf_segformer_merges_foreground_and_skips_background(monkeypatch) -> None:
    """SegFormer response with 'person' + 'wall' → person mask survives, wall is dropped."""
    image = _white_image(width=8, height=8)

    fake_segments = [
        {"label": "person", "score": 0.95, "mask": _encoded_white_mask(8, 8)},
        {"label": "wall", "score": 0.85, "mask": _encoded_white_mask(8, 8)},
    ]

    provider = HfInferenceSegmentationProvider()
    monkeypatch.setattr(provider, "_call_api", lambda img: fake_segments)

    result = provider.segment(image)
    assert result.foreground_labels == ("person",)
    assert result.mask.shape == (8, 8)
    assert float(result.mask.max()) == pytest.approx(1.0)
    assert "wall" not in result.foreground_labels


def test_hf_segformer_returns_full_mask_when_no_segments(monkeypatch) -> None:
    """No segments returned → defaults to all-subject (np.ones)."""
    image = _white_image(width=4, height=4)

    provider = HfInferenceSegmentationProvider()
    monkeypatch.setattr(provider, "_call_api", lambda img: [])

    result = provider.segment(image)
    assert np.all(result.mask == 1.0)
    assert result.foreground_labels == ()


def test_hf_segformer_wraps_unexpected_exceptions_as_provider_error(
    monkeypatch,
) -> None:
    """Network errors etc. should become ProviderError so chains fall through."""
    image = _white_image()

    provider = HfInferenceSegmentationProvider()

    def boom(_image: Image.Image) -> list[dict]:
        raise ConnectionError("network down")

    monkeypatch.setattr(provider, "_call_api", boom)

    with pytest.raises(ProviderError) as exc_info:
        provider.segment(image)
    assert "network down" in str(exc_info.value)
