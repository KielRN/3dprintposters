import json

from .depth import LuminanceDepthProvider, heightmap_to_image_bytes
from .image_pipeline import fit_image_to_aspect, image_to_png_bytes, load_validated_rgb_image
from .metadata import build_artifact_metadata
from .models import (
    PackageReadinessSummary,
    PrintFileArtifactPaths,
    PrintFileGenerationRequest,
    PrintFileGenerationResponse,
)
from .relief import binary_stl_bytes, build_closed_relief_mesh
from .storage import StorageAdapter, artifact_path


def build_artifact_paths(output_prefix: str) -> PrintFileArtifactPaths:
    return PrintFileArtifactPaths(
        model_stl=artifact_path(output_prefix, "model.stl"),
        heightmap_png=artifact_path(output_prefix, "heightmap.png"),
        preview_glb=artifact_path(output_prefix, "preview.glb"),
        metadata_json=artifact_path(output_prefix, "metadata.json"),
        full_color_3mf=artifact_path(output_prefix, "full-color/print-package.3mf"),
        full_color_obj=artifact_path(output_prefix, "full-color/model.obj"),
        full_color_texture_png=artifact_path(output_prefix, "full-color/texture.png"),
        full_color_vrml=artifact_path(output_prefix, "full-color/model.wrl"),
        full_color_ply=artifact_path(output_prefix, "full-color/model.ply"),
        filament_palette_json=artifact_path(output_prefix, "filament-painting/palette.json"),
        filament_layer_swaps_txt=artifact_path(output_prefix, "filament-painting/layer-swaps.txt"),
        filament_print_settings_json=artifact_path(
            output_prefix,
            "filament-painting/print-settings.json",
        ),
        filament_preview_png=artifact_path(output_prefix, "filament-painting/preview.png"),
    )


def generate_print_file_bundle(
    request: PrintFileGenerationRequest,
    *,
    storage: StorageAdapter,
) -> PrintFileGenerationResponse:
    artifact_paths = build_artifact_paths(request.output_prefix)
    source_bytes = storage.read_bytes(request.selected_image_path)
    source_image = load_validated_rgb_image(
        source_bytes,
        max_pixels=request.relief.max_source_pixels,
    )
    normalized_image = fit_image_to_aspect(
        source_image,
        target_width_mm=request.dimensions.target_width_mm,
        target_height_mm=request.dimensions.target_height_mm,
        target_width_px=request.relief.target_width_px,
    )

    height_provider = LuminanceDepthProvider()
    heightmap = height_provider.generate(
        normalized_image.image,
        base_thickness_mm=request.relief.base_thickness_mm,
        min_relief_mm=request.relief.min_relief_mm,
        max_relief_mm=request.relief.max_relief_mm,
    )
    mesh = build_closed_relief_mesh(
        heightmap.values,
        width_mm=request.dimensions.target_width_mm,
        height_mm=request.dimensions.target_height_mm,
    )
    stl_bytes = binary_stl_bytes(mesh)
    metadata = build_artifact_metadata(
        job_id=request.job_id,
        uid=request.uid,
        normalized_image=normalized_image,
        heightmap=heightmap,
        mesh=mesh,
        binary_stl_size=len(stl_bytes),
        base_thickness_mm=request.relief.base_thickness_mm,
    )

    storage.write_bytes(
        artifact_paths.model_stl,
        stl_bytes,
        content_type="model/stl",
    )
    storage.write_bytes(
        artifact_paths.heightmap_png,
        heightmap_to_image_bytes(heightmap),
        content_type="image/png",
    )
    storage.write_bytes(
        artifact_paths.metadata_json,
        json.dumps(metadata.to_dict(), indent=2, sort_keys=True).encode("utf-8"),
        content_type="application/json",
    )
    storage.write_bytes(
        artifact_paths.filament_preview_png,
        image_to_png_bytes(normalized_image.image),
        content_type="image/png",
    )

    return PrintFileGenerationResponse(
        job_id=request.job_id,
        status="generated",
        artifact_paths=artifact_paths,
        printability=PackageReadinessSummary(
            status="passed_with_warnings",
            checks=[
                "source_image_validated",
                "image_normalized_to_5x7",
                "luminance_heightmap_generated",
                "closed_binary_stl_generated",
                "metadata_written",
            ],
            warnings=[
                "GLB preview generation is not implemented yet.",
                "Full-color 3MF/OBJ/VRML/PLY packages are not implemented yet.",
                "Filament painting palette and layer swap logic are not implemented yet.",
            ],
        ),
    )
