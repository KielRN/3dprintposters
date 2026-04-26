from .models import ConversionRequest, ConversionResponse, PrintabilitySummary


def build_stub_conversion_response(request: ConversionRequest) -> ConversionResponse:
    """Return planned artifact paths until the real mesh generator is implemented."""
    prefix = request.output_prefix.rstrip("/")

    return ConversionResponse(
        job_id=request.job_id,
        status="accepted",
        stl_path=f"{prefix}/model.stl",
        heightmap_path=f"{prefix}/heightmap.png",
        preview_mesh_path=f"{prefix}/preview.glb",
        printability=PrintabilitySummary(
            status="not_checked",
            checks=[
                "contract_validated",
                "artifact_paths_reserved",
            ],
            warnings=[
                "STL generation is not implemented yet.",
            ],
        ),
    )

