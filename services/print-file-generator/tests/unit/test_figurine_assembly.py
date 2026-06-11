from pathlib import Path

import pytest

from app.figurine_assembly import assemble_figurine_package
from app.models import FigurineAssemblyRequest
from app.storage import LocalFilesystemStorage

ASSET_DIR = (
    Path(__file__).resolve().parents[2]
    / "assets"
    / "figurine-bases"
    / "figurine-square-v1"
)


def _write_body_glb(path: Path) -> None:
    import trimesh

    # Y is deliberately tallest to exercise the Creative Lab y-up -> Z-up path.
    mesh = trimesh.creation.box(extents=(8.0, 30.0, 12.0))
    mesh.apply_translation((0.0, 15.0, 0.0))
    mesh.export(path)


def _request(tmp_path: Path) -> FigurineAssemblyRequest:
    body_path = tmp_path / "body.glb"
    base_path = tmp_path / "named-base.stl"
    _write_body_glb(body_path)
    base_path.write_bytes((ASSET_DIR / "base.stl").read_bytes())
    return FigurineAssemblyRequest(
        job_id="job-123",
        uid="user-123",
        source_preview_glb_path=str(body_path),
        named_base_stl_path=str(base_path),
        base_id="figurine-square-v1",
        named_base_revision="revision-1",
        output_prefix=str(tmp_path / "out" / "assembly-1"),
    )


def test_assembly_exports_review_artifacts_and_metadata(tmp_path: Path) -> None:
    response = assemble_figurine_package(
        _request(tmp_path),
        storage=LocalFilesystemStorage(),
    )

    assert response["status"] == "assembled"
    assert response["assembly_id"] == "assembly-1"
    artifacts = response["artifact_paths"]
    assert set(artifacts) == {
        "assembledPreviewGlb",
        "assembledStl",
        "assembled3mf",
        "sourcePreviewGlb",
        "sourceNamedBaseStl",
        "metadata",
    }
    for artifact_path in artifacts.values():
        assert Path(artifact_path).is_file()

    metrics = response["metrics"]
    assert metrics["targetBodyHeightMm"] == pytest.approx(150.0)
    assert metrics["bodyHeightBeforeScaleMm"] == pytest.approx(30.0)
    assert metrics["scaleFactor"] == pytest.approx(5.0)
    assert metrics["detectedSourceUpAxis"] == "y"
    assert metrics["bodyBoundsMm"]["min"]["z"] == pytest.approx(
        metrics["baseTopPlaneZMm"],
        abs=0.001,
    )
    assert metrics["assembledExtentsMm"]["z"] > 150.0


def test_assembly_rejects_missing_body_input(tmp_path: Path) -> None:
    request = _request(tmp_path)
    request.source_preview_glb_path = str(tmp_path / "missing.glb")

    with pytest.raises(FileNotFoundError):
        assemble_figurine_package(request, storage=LocalFilesystemStorage())
