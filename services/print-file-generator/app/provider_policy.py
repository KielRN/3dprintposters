from dataclasses import dataclass
from typing import Literal


ProviderPolicyRole = Literal[
    "deterministic_fallback",
    "semantic_depth_candidate",
    "masked_depth_candidate",
    "hybrid_quality_candidate",
    "rejected_benchmark",
]


@dataclass(frozen=True)
class HeightProviderPolicy:
    provider: str
    role: ProviderPolicyRole
    fallback_only: bool
    target_quality_path: bool
    checkout_default_allowed: bool
    note: str


HEIGHT_PROVIDER_POLICIES: dict[str, HeightProviderPolicy] = {
    "posterized_luminance": HeightProviderPolicy(
        provider="posterized_luminance",
        role="deterministic_fallback",
        fallback_only=True,
        target_quality_path=False,
        checkout_default_allowed=False,
        note=(
            "Legacy deterministic brightness-to-height reference; not the "
            "production relief path."
        ),
    ),
    "continuous_luminance": HeightProviderPolicy(
        provider="continuous_luminance",
        role="deterministic_fallback",
        fallback_only=True,
        target_quality_path=False,
        checkout_default_allowed=False,
        note=(
            "Smooth deterministic brightness-to-height reference; not a "
            "production-quality relief target."
        ),
    ),
    "lithophane_baseline": HeightProviderPolicy(
        provider="lithophane_baseline",
        role="deterministic_fallback",
        fallback_only=True,
        target_quality_path=False,
        checkout_default_allowed=False,
        note=(
            "Best deterministic detail reference, but background texture is too "
            "strong for the production target path."
        ),
    ),
    "depth_anything_v2_small": HeightProviderPolicy(
        provider="depth_anything_v2_small",
        role="semantic_depth_candidate",
        fallback_only=False,
        target_quality_path=False,
        checkout_default_allowed=False,
        note=(
            "Raw semantic-depth experiment; useful input, but not the final "
            "relief-quality path."
        ),
    ),
    "depth_anything_v2_small_bas_relief": HeightProviderPolicy(
        provider="depth_anything_v2_small_bas_relief",
        role="semantic_depth_candidate",
        fallback_only=False,
        target_quality_path=True,
        checkout_default_allowed=False,
        note="Semantic depth plus bas-relief compression candidate.",
    ),
    "segformer_masked_depth": HeightProviderPolicy(
        provider="segformer_masked_depth",
        role="masked_depth_candidate",
        fallback_only=False,
        target_quality_path=True,
        checkout_default_allowed=False,
        note="Subject-masked semantic-depth candidate.",
    ),
    "masked_depth_detail_blend": HeightProviderPolicy(
        provider="masked_depth_detail_blend",
        role="hybrid_quality_candidate",
        fallback_only=False,
        target_quality_path=True,
        checkout_default_allowed=True,
        note=(
            "Production relief path: semantic depth, subject mask, subject-only "
            "deterministic detail, and bas-relief compression."
        ),
    ),
    "triposr_sidecar": HeightProviderPolicy(
        provider="triposr_sidecar",
        role="rejected_benchmark",
        fallback_only=False,
        target_quality_path=False,
        checkout_default_allowed=False,
        note=(
            "Rejected image-to-3D benchmark for poster relief; kept only for "
            "audit of the experiment cycle."
        ),
    ),
}


def get_height_provider_policy(provider: str) -> HeightProviderPolicy:
    try:
        return HEIGHT_PROVIDER_POLICIES[provider]
    except KeyError as exc:
        raise ValueError(f"Unknown height provider policy: {provider}") from exc


def provider_policy_warning(provider: str) -> str | None:
    policy = get_height_provider_policy(provider)
    if policy.fallback_only:
        return (
            f"{provider} is a deterministic brightness-to-height safety net, "
            "not the target production-quality relief path."
        )
    if policy.role == "rejected_benchmark":
        return f"{provider} is a rejected benchmark and should not be used for checkout."
    return None
