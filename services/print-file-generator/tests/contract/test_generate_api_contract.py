import json
import struct

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.generation import build_stub_generation_response
from app.main import app
from app.models import OutputMode, PrintFileGenerationRequest, ReliefSettings
from app.packages import generate_print_file_bundle
from app.storage import LocalFilesystemStorage
from tests.support import fake_depth_result, fake_no_face_regions, fake_subject_mask_result


def _stub_hybrid_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_infer_depth_result(img: Image.Image):
        return fake_depth_result(img.width, img.height)

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ):
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=1,
            y_end=img.height - 1,
            x_start=1,
            x_end=img.width - 1,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )
    monkeypatch.setattr(
        "app.depth.analyze_portrait_regions",
        lambda img: fake_no_face_regions(img.width, img.height),
    )


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
    assert response.artifact_paths.full_color_obj_mtl.endswith("/full-color/model.mtl")
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
    assert request.dimensions.target_width_mm == 139.7
    assert request.dimensions.target_height_mm == 190.5
    assert request.dimensions.image_window_width_mm == 127.0
    assert request.dimensions.image_window_height_mm == 177.8
    assert request.dimensions.border_mm == 6.35
    assert request.relief.height_provider == "masked_depth_detail_blend"
    assert request.relief.detail_source == "lithophane_baseline"
    assert request.relief.detail_weight == 0.12
    assert request.relief.target_width_px == 400
    assert request.relief.geometry_analysis_width_px == 768
    assert request.relief.max_triangle_count == 1_000_000
    assert request.relief.max_binary_stl_bytes == 50_000_000
    assert request.relief.max_source_pixels == 4_000_000
    assert request.style_metadata.proof_style_contract.contract_id == (
        "super-dad-north-star-v1"
    )
    assert request.style_metadata.surface_intent_policy.policy_id == "smooth-default-v1"
    assert request.style_metadata.surface_intent_policy.default_treatment == "smooth"
    assert (
        "smooth_scalp"
        in request.style_metadata.surface_intent_policy.smooth_intents
    )
    assert (
        "smooth_body" in request.style_metadata.surface_intent_policy.smooth_intents
    )
    assert (
        "raised_text" in request.style_metadata.surface_intent_policy.crisp_intents
    )


def test_request_accepts_selected_style_surface_intent_metadata() -> None:
    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path="generated/user_123/job_123/preview.png",
        output_prefix="print-files/user_123/job_123",
        style_metadata={
            "selectedStyle": "gallery-relief",
            "promptText": "do not persist raw prompt text",
            "surface_intent_policy": {
                "policy_id": "custom-smooth-default-v1",
                "regions": [
                    {
                        "intent": "smooth_skin",
                        "treatment": "smooth",
                        "detail_weight": 0.0,
                        "source": "proof_generation",
                    },
                    {
                        "intent": "raised_logo",
                        "treatment": "crisp_raised",
                        "detail_weight": 0.8,
                        "source": "proof_generation",
                    },
                ],
            },
        },
    )

    assert request.style_metadata.selected_style == "gallery-relief"
    assert (
        request.style_metadata.surface_intent_policy.policy_id
        == "custom-smooth-default-v1"
    )
    assert request.style_metadata.surface_intent_policy.regions[0].intent == (
        "smooth_skin"
    )
    assert request.style_metadata.surface_intent_policy.regions[1].treatment == (
        "crisp_raised"
    )
    assert "promptText" not in request.style_metadata.to_metadata()


def test_local_generation_writes_default_hybrid_relief_bundle(
    tmp_path,
    monkeypatch,
) -> None:
    _stub_hybrid_providers(monkeypatch)
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
        relief=ReliefSettings(
            target_width_px=40,
            geometry_analysis_width_px=64,
        ),
        style_metadata={"selectedStyle": "gallery-relief"},
    )

    response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    assert response.status == "generated"
    assert response.printability.status == "passed"
    assert (output_prefix / "model.stl").exists()
    assert (output_prefix / "preview.glb").exists()
    assert (output_prefix / "heightmap.png").exists()
    assert (output_prefix / "metadata.json").exists()
    assert (output_prefix / "full-color" / "print-package.3mf").exists()
    assert (output_prefix / "full-color" / "model.obj").exists()
    assert (output_prefix / "full-color" / "model.mtl").exists()
    assert (output_prefix / "full-color" / "texture.png").exists()
    assert (output_prefix / "full-color" / "model.wrl").exists()
    assert (output_prefix / "full-color" / "model.ply").exists()
    assert (output_prefix / "filament-painting" / "palette.json").exists()
    assert (output_prefix / "filament-painting" / "layer-swaps.txt").exists()
    assert (output_prefix / "filament-painting" / "print-settings.json").exists()
    assert (output_prefix / "filament-painting" / "preview.png").exists()
    assert (output_prefix / "debug" / "geometry-input.png").exists()
    assert (output_prefix / "debug" / "final-heightmap.png").exists()
    assert "color_preview_glb_generated" in response.printability.checks
    assert "full_color_3mf_generated" in response.printability.checks
    assert "filament_layer_swaps_generated" in response.printability.checks
    assert "debug_artifacts_written" in response.printability.checks

    stl_bytes = (output_prefix / "model.stl").read_bytes()
    triangle_count = struct.unpack("<I", stl_bytes[80:84])[0]
    assert len(stl_bytes) == 84 + triangle_count * 50
    assert (output_prefix / "preview.glb").read_bytes().startswith(b"glTF")

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["job_id"] == "job_123"
    assert metadata["width_mm"] == 139.7
    assert metadata["height_mm"] == 190.5
    assert metadata["image_window_width_mm"] == 127.0
    assert metadata["image_window_height_mm"] == 177.8
    assert metadata["border_mm"] == 6.35
    assert metadata["height_provider"] == "masked_depth_detail_blend"
    assert metadata["height_provider_policy"] == "hybrid_quality_candidate"
    assert metadata["height_provider_fallback_only"] is False
    assert metadata["height_provider_target_quality_path"] is True
    assert metadata["height_provider_checkout_default_allowed"] is True
    assert metadata["selected_style"] == "gallery-relief"
    assert metadata["proof_style_contract"]["contract_id"] == (
        "super-dad-north-star-v1"
    )
    assert metadata["proof_style_contract"]["prompt_storage"] == (
        "contract_metadata_only"
    )
    assert metadata["surface_intent_policy"]["policy_id"] == "smooth-default-v1"
    assert metadata["surface_intent_policy"]["default_treatment"] == "smooth"
    assert "smooth_scalp" in metadata["surface_intent_policy"]["smooth_intents"]
    assert "smooth_body" in metadata["surface_intent_policy"]["smooth_intents"]
    assert "raised_text" in metadata["surface_intent_policy"]["crisp_intents"]
    assert metadata["provider_settings"] == {
        "detail_source": "lithophane_baseline",
        "detail_weight": 0.12,
        "debug_artifacts": "enabled",
        "face_pit_guard": "enabled",
        "geometry_input": "subject_aware_cleanup",
        "geometry_analysis_width_px": 64,
        "mesh_target_width_px": 40,
        "portrait_nose_boost": "disabled",
        "portrait_surface_smoothing": "expanded_face_oval",
    }
    assert response.artifact_paths.debug_artifacts["geometry-input.png"].endswith(
        "/debug/geometry-input.png"
    )
    assert response.artifact_paths.debug_artifacts["final-heightmap.png"].endswith(
        "/debug/final-heightmap.png"
    )
    assert metadata["normalized_width_px"] == 40
    assert metadata["geometry_analysis_width_px"] == 64
    assert metadata["full_color_package"]["formats"] == ["3mf", "obj", "vrml", "ply"]
    assert metadata["filament_painting"]["palette_color_count"] >= 1
    assert metadata["watertight"] is True
    assert metadata["triangle_count"] == triangle_count
    assert not any(
        "not the target production-quality relief path" in warning
        for warning in response.printability.warnings
    )


def test_local_generation_accepts_default_ai_proof_size(tmp_path, monkeypatch) -> None:
    _stub_hybrid_providers(monkeypatch)
    source_path = tmp_path / "ai-proof.png"
    output_prefix = tmp_path / "print-files"
    Image.new("RGB", (1024, 1024), color=(255, 255, 255)).save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_ai_proof",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(
            target_width_px=40,
            geometry_analysis_width_px=64,
        ),
    )

    response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    assert response.status == "generated"
    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["source_width_px"] == 1024
    assert metadata["source_height_px"] == 1024
    assert metadata["normalized_width_px"] == request.relief.target_width_px
    assert metadata["geometry_analysis_width_px"] == request.relief.geometry_analysis_width_px


def test_known_image_metadata_is_deterministic(tmp_path, monkeypatch) -> None:
    _stub_hybrid_providers(monkeypatch)
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
            relief=ReliefSettings(
                target_width_px=4,
                geometry_analysis_width_px=8,
            ),
        )

        generate_print_file_bundle(request, storage=LocalFilesystemStorage())
        metadatas.append(json.loads((output_prefix / "metadata.json").read_text()))

    assert metadatas[0] == metadatas[1]
    assert metadatas[0]["normalized_width_px"] == 4
    assert metadatas[0]["normalized_height_px"] == 6
    assert metadatas[0]["vertex_count"] == 336
    assert metadatas[0]["triangle_count"] == 668
    assert metadatas[0]["binary_stl_bytes"] == 33484
    assert metadatas[0]["height_provider"] == "masked_depth_detail_blend"


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
            geometry_analysis_width_px=8,
            heightmap_png_bit_depth=16,
        ),
    )

    generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["height_provider"] == "lithophane_baseline"
    assert metadata["height_provider_policy"] == "deterministic_fallback"
    assert metadata["height_provider_fallback_only"] is True
    assert metadata["height_provider_target_quality_path"] is False
    assert (output_prefix / "heightmap.png").exists()


def test_local_generation_can_run_masked_depth_detail_blend(
    tmp_path,
    monkeypatch,
) -> None:
    source_path = tmp_path / "known-source.png"
    output_prefix = tmp_path / "print-files"
    image = Image.new("RGB", (10, 14), color=(180, 180, 180))
    image.save(source_path)

    def fake_infer_depth_result(img: Image.Image):
        return fake_depth_result(img.width, img.height)

    def fake_generate_mask_result(
        img: Image.Image,
        *,
        blur_radius_px: float = 5.0,
        full_image_threshold: float = 0.90,
    ):
        return fake_subject_mask_result(
            img.width,
            img.height,
            y_start=1,
            y_end=img.height - 1,
            x_start=1,
            x_end=img.width - 1,
        )

    monkeypatch.setattr(
        "app.depth._infer_depth_anything_v2_small_result",
        fake_infer_depth_result,
    )
    monkeypatch.setattr(
        "app.depth._generate_subject_mask_result",
        fake_generate_mask_result,
    )
    monkeypatch.setattr(
        "app.depth.analyze_portrait_regions",
        lambda img: fake_no_face_regions(img.width, img.height),
    )

    request = PrintFileGenerationRequest(
        job_id="job_known",
        uid="user_known",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(
            height_provider="masked_depth_detail_blend",
            target_width_px=8,
            geometry_analysis_width_px=16,
            detail_source="posterized_luminance",
            detail_weight=0.3,
        ),
    )

    response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())

    metadata = json.loads((output_prefix / "metadata.json").read_text())
    assert metadata["height_provider"] == "masked_depth_detail_blend"
    assert metadata["height_provider_policy"] == "hybrid_quality_candidate"
    assert metadata["height_provider_fallback_only"] is False
    assert metadata["height_provider_target_quality_path"] is True
    assert metadata["provider_audit"] == {
        "monocular_depth": {
            "succeeded": "stub-depth",
            "attempted": [],
            "model_version": "stub:v1",
        },
        "subject_segmentation": {
            "succeeded": "stub-segmentation",
            "attempted": [],
            "model_version": "stub:v1",
        },
    }
    segmentation_status = metadata["segmentation_status"]
    assert segmentation_status["status"] == "ok"
    expected_mask_coverage = (
        (metadata["geometry_analysis_height_px"] - 2)
        * (metadata["geometry_analysis_width_px"] - 2)
        / (
            metadata["geometry_analysis_height_px"]
            * metadata["geometry_analysis_width_px"]
        )
    )
    assert segmentation_status["mask_coverage"] == pytest.approx(expected_mask_coverage)
    assert segmentation_status["foreground_labels"] == ["person"]
    assert segmentation_status["raw_segment_count"] == 1
    face_analysis_status = metadata["face_analysis_status"]
    assert face_analysis_status["status"] == "no_face"
    assert face_analysis_status["face_count"] == 0
    assert face_analysis_status["detector"] == "stub"
    assert metadata["provider_settings"] == {
        "detail_source": "posterized_luminance",
        "detail_weight": 0.3,
        "debug_artifacts": "enabled",
        "face_pit_guard": "enabled",
        "geometry_input": "subject_aware_cleanup",
        "geometry_analysis_width_px": 16,
        "mesh_target_width_px": 8,
        "portrait_nose_boost": "disabled",
        "portrait_surface_smoothing": "expanded_face_oval",
    }
    assert not any(
        "not the target production-quality relief path" in warning
        for warning in response.printability.warnings
    )


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


def test_local_generation_rejects_artifacts_over_triangle_limit(
    tmp_path,
    monkeypatch,
) -> None:
    _stub_hybrid_providers(monkeypatch)
    source_path = tmp_path / "source.png"
    output_prefix = tmp_path / "print-files"
    Image.new("RGB", (4, 4), color=(255, 255, 255)).save(source_path)

    request = PrintFileGenerationRequest(
        job_id="job_123",
        uid="user_123",
        selected_image_path=str(source_path),
        output_prefix=str(output_prefix),
        relief=ReliefSettings(
            target_width_px=4,
            geometry_analysis_width_px=8,
            max_triangle_count=1,
        ),
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
