from .models import (
    PackageReadinessSummary,
    PrintFileArtifactPaths,
    PrintFileGenerationRequest,
    PrintFileGenerationResponse,
)


def build_stub_generation_response(
    request: PrintFileGenerationRequest,
) -> PrintFileGenerationResponse:
    """Return planned artifact paths until real print file generation is implemented."""
    prefix = request.output_prefix.rstrip("/")

    return PrintFileGenerationResponse(
        job_id=request.job_id,
        status="accepted",
        artifact_paths=PrintFileArtifactPaths(
            model_stl=f"{prefix}/model.stl",
            heightmap_png=f"{prefix}/heightmap.png",
            preview_glb=f"{prefix}/preview.glb",
            metadata_json=f"{prefix}/metadata.json",
            full_color_3mf=f"{prefix}/full-color/print-package.3mf",
            full_color_obj=f"{prefix}/full-color/model.obj",
            full_color_texture_png=f"{prefix}/full-color/texture.png",
            full_color_vrml=f"{prefix}/full-color/model.wrl",
            full_color_ply=f"{prefix}/full-color/model.ply",
            filament_palette_json=f"{prefix}/filament-painting/palette.json",
            filament_layer_swaps_txt=f"{prefix}/filament-painting/layer-swaps.txt",
            filament_print_settings_json=f"{prefix}/filament-painting/print-settings.json",
            filament_preview_png=f"{prefix}/filament-painting/preview.png",
        ),
        printability=PackageReadinessSummary(
            status="not_checked",
            checks=[
                "contract_validated",
                "artifact_paths_reserved",
            ],
            warnings=[
                "Print file generation is not implemented yet.",
                "Filament painting layer logic is not implemented yet.",
            ],
        ),
    )
