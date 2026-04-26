from app.conversion import build_stub_conversion_response
from app.models import ConversionRequest


def test_stub_conversion_contract_returns_planned_paths() -> None:
    request = ConversionRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="generated/user_123/job_123/preview.png",
        output_prefix="stl/user_123/job_123",
    )

    response = build_stub_conversion_response(request)

    assert response.job_id == "job_123"
    assert response.status == "accepted"
    assert response.stl_path == "stl/user_123/job_123/model.stl"
    assert response.heightmap_path == "stl/user_123/job_123/heightmap.png"
    assert response.printability.status == "not_checked"

