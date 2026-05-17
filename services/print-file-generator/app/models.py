from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


PRODUCTION_TARGET_WIDTH_PX = 400
PRODUCTION_GEOMETRY_ANALYSIS_WIDTH_PX = 768
PRODUCTION_MAX_TRIANGLE_COUNT = 1_000_000
PRODUCTION_MAX_BINARY_STL_BYTES = 50_000_000


class OutputMode(str, Enum):
    FULL_COLOR_RELIEF = "full_color_relief"
    FILAMENT_PAINTING = "filament_painting"


class PhysicalDimensions(BaseModel):
    target_width_mm: float = Field(default=139.7, gt=0)
    target_height_mm: float = Field(default=190.5, gt=0)
    image_window_width_mm: float = Field(default=127.0, gt=0)
    image_window_height_mm: float = Field(default=177.8, gt=0)
    border_mm: float = Field(default=6.35, ge=0)

    @model_validator(mode="after")
    def validate_image_window_and_border(self) -> "PhysicalDimensions":
        expected_width = self.image_window_width_mm + 2 * self.border_mm
        expected_height = self.image_window_height_mm + 2 * self.border_mm
        if abs(self.target_width_mm - expected_width) > 0.001:
            raise ValueError(
                "Target width must equal image window width plus twice the border"
            )
        if abs(self.target_height_mm - expected_height) > 0.001:
            raise ValueError(
                "Target height must equal image window height plus twice the border"
            )
        return self


class ReliefSettings(BaseModel):
    height_provider: Literal[
        "posterized_luminance",
        "continuous_luminance",
        "lithophane_baseline",
        "depth_anything_v2_small",
        "depth_anything_v2_small_bas_relief",
        "segformer_masked_depth",
        "masked_depth_detail_blend",
        "triposr_sidecar",
    ] = "masked_depth_detail_blend"
    base_thickness_mm: float = Field(default=1.2, gt=0)
    min_relief_mm: float = Field(default=0.4, ge=0)
    max_relief_mm: float = Field(default=3.0, gt=0)
    max_source_pixels: int = Field(default=4_000_000, ge=4)
    target_width_px: int = Field(default=PRODUCTION_TARGET_WIDTH_PX, ge=2)
    geometry_analysis_width_px: int = Field(
        default=PRODUCTION_GEOMETRY_ANALYSIS_WIDTH_PX,
        ge=2,
    )
    max_triangle_count: int = Field(default=PRODUCTION_MAX_TRIANGLE_COUNT, ge=1)
    max_binary_stl_bytes: int = Field(default=PRODUCTION_MAX_BINARY_STL_BYTES, ge=84)
    contrast: float = Field(default=1.0, gt=0)
    gamma: float = Field(default=1.0, gt=0)
    post_smooth_radius_px: float = Field(default=0.0, ge=0)
    heightmap_png_bit_depth: Literal[8, 16] = 8
    detail_source: Literal["lithophane_baseline", "posterized_luminance"] = (
        "lithophane_baseline"
    )
    detail_weight: float = Field(default=0.12, ge=0, le=1)

    @model_validator(mode="after")
    def validate_relief_range(self) -> "ReliefSettings":
        if self.min_relief_mm > self.max_relief_mm:
            raise ValueError("Minimum relief cannot exceed maximum relief")
        if self.geometry_analysis_width_px < self.target_width_px:
            raise ValueError(
                "Geometry analysis width must be greater than or equal to target width"
            )
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
    full_color_obj_mtl: str
    full_color_texture_png: str
    full_color_vrml: str
    full_color_ply: str
    filament_palette_json: str
    filament_layer_swaps_txt: str
    filament_print_settings_json: str
    filament_preview_png: str
    debug_artifacts: dict[str, str] = Field(default_factory=dict)


class PackageReadinessSummary(BaseModel):
    status: str
    checks: list[str]
    warnings: list[str] = Field(default_factory=list)


class PrintFileGenerationResponse(BaseModel):
    job_id: str
    status: str
    artifact_paths: PrintFileArtifactPaths
    printability: PackageReadinessSummary
