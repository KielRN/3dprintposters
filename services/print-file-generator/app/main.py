from fastapi import FastAPI

from .generation import build_stub_generation_response
from .models import PrintFileGenerationRequest, PrintFileGenerationResponse

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
    return build_stub_generation_response(request)
