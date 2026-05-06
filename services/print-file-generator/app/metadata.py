from dataclasses import asdict, dataclass

from .depth import Heightmap
from .image_pipeline import NormalizedImage
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
    base_thickness_mm: float
    min_height_mm: float
    max_height_mm: float
    vertex_count: int
    triangle_count: int
    binary_stl_bytes: int
    height_provider: str
    watertight: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def build_artifact_metadata(
    *,
    job_id: str,
    uid: str,
    normalized_image: NormalizedImage,
    heightmap: Heightmap,
    mesh: ReliefMesh,
    binary_stl_size: int,
    base_thickness_mm: float,
) -> ArtifactMetadata:
    return ArtifactMetadata(
        job_id=job_id,
        uid=uid,
        source_width_px=normalized_image.source_width_px,
        source_height_px=normalized_image.source_height_px,
        normalized_width_px=normalized_image.normalized_width_px,
        normalized_height_px=normalized_image.normalized_height_px,
        width_mm=mesh.width_mm,
        height_mm=mesh.height_mm,
        base_thickness_mm=base_thickness_mm,
        min_height_mm=heightmap.min_height_mm,
        max_height_mm=heightmap.max_height_mm,
        vertex_count=len(mesh.vertices),
        triangle_count=len(mesh.faces),
        binary_stl_bytes=binary_stl_size,
        height_provider=heightmap.provider,
        watertight=True,
    )
