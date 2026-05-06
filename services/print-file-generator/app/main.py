from fastapi import FastAPI, HTTPException

from .packages import generate_print_file_bundle
from .models import PrintFileGenerationRequest, PrintFileGenerationResponse
from .storage import GoogleCloudStorage, LocalFilesystemStorage

app = FastAPI(
    title="3D Print Posters Print File Generator",
    version="0.1.0",
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/generate", response_model=PrintFileGenerationResponse)
async def generate_print_files(
    request: PrintFileGenerationRequest,
) -> PrintFileGenerationResponse:
    if request.selected_image_path.startswith("gs://") or request.output_prefix.startswith("gs://"):
        storage = GoogleCloudStorage()
    else:
        storage = LocalFilesystemStorage()

    try:
        return generate_print_file_bundle(request, storage=storage)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
