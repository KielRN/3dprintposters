from pydantic import BaseModel, Field


class ConversionRequest(BaseModel):
    job_id: str = Field(min_length=1)
    uid: str = Field(min_length=1)
    selected_image_path: str = Field(min_length=1)
    output_prefix: str = Field(min_length=1)
    target_width_mm: float = Field(default=216.0, gt=0)
    target_height_mm: float = Field(default=279.0, gt=0)
    base_thickness_mm: float = Field(default=1.2, gt=0)
    min_relief_mm: float = Field(default=0.4, ge=0)
    max_relief_mm: float = Field(default=3.0, gt=0)
    material_profile: str = "white_resin_high_detail"


class PrintabilitySummary(BaseModel):
    status: str
    checks: list[str]
    warnings: list[str] = []


class ConversionResponse(BaseModel):
    job_id: str
    status: str
    stl_path: str
    heightmap_path: str
    preview_mesh_path: str | None = None
    printability: PrintabilitySummary

