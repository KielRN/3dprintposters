from fastapi import FastAPI, HTTPException

from .figurine_name_base import NameValidationError, generate_named_base_bundle
from .packages import generate_print_file_bundle
from .models import (
    FigurineNamedBaseRequest,
    FigurineNamedBaseResponse,
    PrintFileGenerationRequest,
    PrintFileGenerationResponse,
)
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


@app.post("/v1/figurine/named-base", response_model=FigurineNamedBaseResponse)
async def generate_figurine_named_base(
    request: FigurineNamedBaseRequest,
) -> FigurineNamedBaseResponse:
    if request.output_prefix.startswith("gs://"):
        storage = GoogleCloudStorage()
    else:
        storage = LocalFilesystemStorage()

    try:
        payload = generate_named_base_bundle(request, storage=storage)
    except NameValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FigurineNamedBaseResponse(**payload)
