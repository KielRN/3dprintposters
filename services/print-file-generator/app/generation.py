from .models import (
    PackageReadinessSummary,
    PrintFileGenerationRequest,
    PrintFileGenerationResponse,
)
from .packages import build_artifact_paths


def build_stub_generation_response(
    request: PrintFileGenerationRequest,
) -> PrintFileGenerationResponse:
    """Return planned artifact paths until real print file generation is implemented."""
    return PrintFileGenerationResponse(
        job_id=request.job_id,
        status="accepted",
        artifact_paths=build_artifact_paths(request.output_prefix),
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
