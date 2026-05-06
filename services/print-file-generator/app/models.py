from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class OutputMode(str, Enum):
    FULL_COLOR_RELIEF = "full_color_relief"
    FILAMENT_PAINTING = "filament_painting"


class PhysicalDimensions(BaseModel):
    target_width_mm: float = Field(default=127.0, gt=0)
    target_height_mm: float = Field(default=177.8, gt=0)


class ReliefSettings(BaseModel):
    base_thickness_mm: float = Field(default=1.2, gt=0)
    min_relief_mm: float = Field(default=0.4, ge=0)
    max_relief_mm: float = Field(default=3.0, gt=0)
    max_source_pixels: int = Field(default=250_000, ge=4)
    target_width_px: int = Field(default=160, ge=2)

    @model_validator(mode="after")
    def validate_relief_range(self) -> "ReliefSettings":
        if self.min_relief_mm > self.max_relief_mm:
            raise ValueError("Minimum relief cannot exceed maximum relief")
        return self


class FilamentPaintingSettings(BaseModel):
    layer_height_mm: float = Field(default=0.2, gt=0)
    nozzle_diameter_mm: float = Field(default=0.4, gt=0)
    max_filament_colors: int = Field(default=4, ge=1)
    prefer_single_nozzle_swaps: bool = True


class PrintFileGenerationRequest(BaseModel):
    job_id: str = Field(min_length=1)
    uid: str = Field(min_length=1)
    selected_image_path: str = Field(min_length=1)
    output_prefix: str = Field(min_length=1)
    requested_modes: list[OutputMode] = Field(
        default_factory=lambda: [
            OutputMode.FULL_COLOR_RELIEF,
            OutputMode.FILAMENT_PAINTING,
        ]
    )
    dimensions: PhysicalDimensions = Field(default_factory=PhysicalDimensions)
    relief: ReliefSettings = Field(default_factory=ReliefSettings)
    full_color_material_profile: str = "mimaki_3duj_2207_full_color_uv_resin"
    filament_material_profile: str = "generic_multicolor_fdm_filament_painting"
    filament_painting: FilamentPaintingSettings = Field(
        default_factory=FilamentPaintingSettings
    )
    style_metadata: dict[str, Any] = Field(default_factory=dict)


class PrintFileArtifactPaths(BaseModel):
    model_stl: str
    heightmap_png: str
    preview_glb: str
    metadata_json: str
    full_color_3mf: str
    full_color_obj: str
    full_color_texture_png: str
    full_color_vrml: str
    full_color_ply: str
    filament_palette_json: str
    filament_layer_swaps_txt: str
    filament_print_settings_json: str
    filament_preview_png: str


class PackageReadinessSummary(BaseModel):
    status: str
    checks: list[str]
    warnings: list[str] = Field(default_factory=list)


class PrintFileGenerationResponse(BaseModel):
    job_id: str
    status: str
    artifact_paths: PrintFileArtifactPaths
    printability: PackageReadinessSummary
