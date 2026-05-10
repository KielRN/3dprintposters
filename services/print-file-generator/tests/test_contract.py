import json
import struct

import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.generation import build_stub_generation_response
from app.main import app
from app.models import OutputMode, PrintFileGenerationRequest, ReliefSettings
from app.packages import generate_print_file_bundle
from app.storage import LocalFilesystemStorage


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
    assert request.relief.height_provider == "posterized_luminance"
    assert request.relief.max_source_pixels == 4_000_000


def test_local_generation_writes_deterministic_relief_bundle(tmp_path) -> None:
    source_path = tmp_path / "source.png"
    output_prefix = tmp_path / "print-files"
    image = Image.new("RGB", (4, 4))
    image.putdata(
        [
            (0, 0, 0),
            (64, 64, 64),
            (128, 128, 128),
            (255, 255, 255),
        ]
        * 4
    )
    image.save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
    )

    response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    assert response.status == "generated"
    assert response.printability.status == "passed_with_warnings"
    assert (output_prefix / "model.stl").exists()
    assert (output_prefix / "preview.glb").exists()
    assert (output_prefix / "heightmap.png").exists()
    assert (output_prefix / "metadata.json").exists()
    assert (output_prefix / "filament-painting" / "preview.png").exists()
    assert "neutral_preview_glb_generated" in response.printability.checks

    stl_bytes = (output_prefix / "model.stl").read_bytes()
    triangle_count = struct.unpack("<I", stl_bytes[80:84])[0]
    assert len(stl_bytes) == 84 + triangle_count * 50
    assert (output_prefix / "preview.glb").read_bytes().startswith(b"glTF")

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["job_id"] == "job_123"
    assert metadata["width_mm"] == 127.0
    assert metadata["height_mm"] == 177.8
    assert metadata["height_provider"] == "posterized_luminance"
    assert metadata["watertight"] is True
    assert metadata["triangle_count"] == triangle_count


def test_local_generation_accepts_default_ai_proof_size(tmp_path) -> None:
    source_path = tmp_path / "ai-proof.png"
    output_prefix = tmp_path / "print-files"
    Image.new("RGB", (1024, 1024), color=(255, 255, 255)).save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_ai_proof",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
    )

    response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    assert response.status == "generated"
    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["source_width_px"] == 1024
    assert metadata["source_height_px"] == 1024
    assert metadata["normalized_width_px"] == request.relief.target_width_px


def test_known_image_metadata_is_deterministic(tmp_path) -> None:
    source_path = tmp_path / "known-source.png"
    image = Image.new("RGB", (10, 14), color=(255, 255, 255))
    image.save(source_path)

    metadatas = []
    for index in range(2):
        output_prefix = tmp_path / f"print-files-{index}"
        request = PrintFileGenerationRequest(
            job_id="job_known",
            uid="user_known",
            selected_image_path=str(source_path),
            output_prefix=str(output_prefix),
            relief=ReliefSettings(target_width_px=4),
        )

        generate_print_file_bundle(request, storage=LocalFilesystemStorage())
        metadatas.append(json.loads((output_prefix / "metadata.json").read_text()))

    assert metadatas[0] == metadatas[1]
    assert metadatas[0]["normalized_width_px"] == 4
    assert metadatas[0]["normalized_height_px"] == 6
    assert metadatas[0]["vertex_count"] == 48
    assert metadatas[0]["triangle_count"] == 92
    assert metadatas[0]["binary_stl_bytes"] == 4684
    assert metadatas[0]["height_provider"] == "posterized_luminance"


def test_local_generation_can_run_experiment_1_lithophane_baseline(tmp_path) -> None:
    source_path = tmp_path / "known-source.png"
    output_prefix = tmp_path / "print-files"
    image = Image.new("RGB", (10, 14), color=(255, 255, 255))
    image.save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_known",
        uid="user_known",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(
            height_provider="lithophane_baseline",
            target_width_px=4,
            heightmap_png_bit_depth=16,
        ),
    )

    generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["height_provider"] == "lithophane_baseline"
    assert (output_prefix / "heightmap.png").exists()


def test_local_generation_can_run_masked_depth_detail_blend(
    tmp_path,
    monkeypatch,
) -> None:
    source_path = tmp_path / "known-source.png"
    output_prefix = tmp_path / "print-files"
    image = Image.new("RGB", (10, 14), color=(180, 180, 180))
    image.save(source_path)

    def fake_infer_depth(img: Image.Image) -> np.ndarray:
        row = np.linspace(0.2, 0.8, img.width, dtype=np.float32)
        return np.tile(row, (img.height, 1))

    def fake_generate_mask(img: Image.Image, *, blur_radius_px: float = 5.0) -> np.ndarray:
        mask = np.zeros((img.height, img.width), dtype=np.float32)
        mask[1:-1, 1:-1] = 1.0
        return mask

    monkeypatch.setattr("app.depth._infer_depth_anything_v2_small", fake_infer_depth)
    monkeypatch.setattr("app.depth._generate_subject_mask", fake_generate_mask)

    request = PrintFileGenerationRequest(
        job_id="job_known",
        uid="user_known",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(
            height_provider="masked_depth_detail_blend",
            target_width_px=8,
            detail_source="posterized_luminance",
            detail_weight=0.3,
        ),
    )

    generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["height_provider"] == "masked_depth_detail_blend"
    assert metadata["provider_settings"] == {
        "detail_source": "posterized_luminance",
        "detail_weight": 0.3,
    }


def test_local_generation_rejects_images_over_generation_limit(tmp_path) -> None:
    source_path = tmp_path / "source.png"
    output_prefix = tmp_path / "print-files"
    Image.new("RGB", (3, 3), color=(255, 255, 255)).save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(max_source_pixels=4),
    )

    with pytest.raises(ValueError, match="maximum decoded size is 4 pixels"):
        generate_print_file_bundle(request, storage=LocalFilesystemStorage())


def test_local_generation_rejects_artifacts_over_triangle_limit(tmp_path) -> None:
    source_path = tmp_path / "source.png"
    output_prefix = tmp_path / "print-files"
    Image.new("RGB", (4, 4), color=(255, 255, 255)).save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(max_triangle_count=1),
    )

    with pytest.raises(ValueError, match="triangle count"):
        generate_print_file_bundle(request, storage=LocalFilesystemStorage())


def test_generate_endpoint_returns_client_error_for_missing_local_image(tmp_path) -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/generate",
        json={
            "job_id": "job_123",
            "uid": "user_123",
            "selected_image_path": str(tmp_path / "missing.png"),
            "output_prefix": str(tmp_path / "print-files"),
        },
    )

    assert response.status_code == 400
    assert "missing.png" in response.json()["detail"]


def test_generate_endpoint_returns_client_error_for_invalid_local_image(tmp_path) -> None:
    source_path = tmp_path / "invalid.png"
    source_path.write_bytes(b"not an image")
    client = TestClient(app)

    response = client.post(
        "/v1/generate",
        json={
            "job_id": "job_123",
            "uid": "user_123",
            "selected_image_path": str(source_path),
            "output_prefix": str(tmp_path / "print-files"),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported or invalid image"
