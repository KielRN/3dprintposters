from dataclasses import asdict, dataclass

from .depth import Heightmap
from .image_pipeline import NormalizedImage
from .provider_policy import get_height_provider_policy
from .relief import ReliefMesh


@dataclass(frozen=True)
class ArtifactMetadata:
    job_id: str
    uid: str
    source_width_px: int
    source_height_px: int
    normalized_width_px: int
    normalized_height_px: int
    width_mm: float
    height_mm: float
    image_window_width_mm: float
    image_window_height_mm: float
    border_mm: float
    base_thickness_mm: float
    min_height_mm: float
    max_height_mm: float
    vertex_count: int
    triangle_count: int
    binary_stl_bytes: int
    height_provider: str
    height_provider_policy: str
    height_provider_fallback_only: bool
    height_provider_target_quality_path: bool
    height_provider_checkout_default_allowed: bool
    watertight: bool
    provider_settings: dict[str, object] | None = None
    provider_audit: dict[str, dict[str, object]] | None = None
    segmentation_status: dict[str, object] | None = None
    full_color_package: dict[str, object] | None = None
    filament_painting: dict[str, object] | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            key: value
            for key, value in asdict(self).items()
            if value is not None
        }


def build_artifact_metadata(
    *,
    job_id: str,
    uid: str,
    normalized_image: NormalizedImage,
    heightmap: Heightmap,
    mesh: ReliefMesh,
    binary_stl_size: int,
    base_thickness_mm: float,
    provider_settings: dict[str, object] | None = None,
    package_metadata: dict[str, object] | None = None,
) -> ArtifactMetadata:
    provider_policy = get_height_provider_policy(heightmap.provider)
    return ArtifactMetadata(
        job_id=job_id,
        uid=uid,
        source_width_px=normalized_image.source_width_px,
        source_height_px=normalized_image.source_height_px,
        normalized_width_px=normalized_image.normalized_width_px,
        normalized_height_px=normalized_image.normalized_height_px,
        width_mm=mesh.width_mm,
        height_mm=mesh.height_mm,
        image_window_width_mm=mesh.image_window_width_mm or mesh.width_mm,
        image_window_height_mm=mesh.image_window_height_mm or mesh.height_mm,
        border_mm=mesh.border_mm,
        base_thickness_mm=base_thickness_mm,
        min_height_mm=heightmap.min_height_mm,
        max_height_mm=heightmap.max_height_mm,
        vertex_count=len(mesh.vertices),
        triangle_count=len(mesh.faces),
        binary_stl_bytes=binary_stl_size,
        height_provider=heightmap.provider,
        height_provider_policy=provider_policy.role,
        height_provider_fallback_only=provider_policy.fallback_only,
        height_provider_target_quality_path=provider_policy.target_quality_path,
        height_provider_checkout_default_allowed=(
            provider_policy.checkout_default_allowed
        ),
        watertight=True,
        provider_settings=provider_settings,
        provider_audit=heightmap.provider_audit,
        segmentation_status=heightmap.segmentation_status,
        full_color_package=(
            package_metadata.get("full_color")
            if package_metadata
            else None
        ),
        filament_painting=(
            package_metadata.get("filament_painting")
            if package_metadata
            else None
        ),
    )
