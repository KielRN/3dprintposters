from fastapi import FastAPI

from .conversion import build_stub_conversion_response
from .models import ConversionRequest, ConversionResponse

app = FastAPI(
    title="3D Print Posters STL Converter",
    version="0.1.0",
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/convert", response_model=ConversionResponse)
async def convert_image_to_stl(request: ConversionRequest) -> ConversionResponse:
    return build_stub_conversion_response(request)

