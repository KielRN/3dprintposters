from app.generation import build_stub_generation_response
from app.models import OutputMode, PrintFileGenerationRequest


def test_stub_generation_contract_returns_planned_bundle_paths() -> None:
    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="generated/user_123/job_123/preview.png",
        output_prefix="print-files/user_123/job_123",
    )

    response = build_stub_generation_response(request)

    assert response.job_id == "job_123"
    assert response.status == "accepted"
    assert response.artifact_paths.model_stl == "print-files/user_123/job_123/model.stl"
    assert response.artifact_paths.heightmap_png == "print-files/user_123/job_123/heightmap.png"
    assert response.artifact_paths.full_color_3mf.endswith("/full-color/print-package.3mf")
    assert response.artifact_paths.filament_palette_json.endswith(
        "/filament-painting/palette.json"
    )
    assert response.artifact_paths.filament_layer_swaps_txt.endswith(
        "/filament-painting/layer-swaps.txt"
    )
    assert response.artifact_paths.filament_print_settings_json.endswith(
        "/filament-painting/print-settings.json"
    )
    assert response.printability.status == "not_checked"


def test_request_defaults_include_both_output_modes() -> None:
    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="generated/user_123/job_123/preview.png",
        output_prefix="print-files/user_123/job_123",
    )

    assert request.requested_modes == [
        OutputMode.FULL_COLOR_RELIEF,
        OutputMode.FILAMENT_PAINTING,
    ]
    assert request.dimensions.target_width_mm == 127.0
    assert request.dimensions.target_height_mm == 177.8
