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


def _write_body_with_provider_base_and_low_outlier_glb(path: Path) -> None:
    import trimesh

    provider_base = trimesh.creation.cylinder(radius=10.0, height=2.0, sections=32)
    provider_base.apply_translation((0.0, 0.0, 1.0))

    torso = trimesh.creation.box(extents=(6.0, 5.0, 28.0))
    torso.apply_translation((0.0, 0.0, 16.0))

    low_outlier = trimesh.creation.box(extents=(0.25, 0.25, 0.5))
    low_outlier.apply_translation((0.0, 0.0, -3.25))

    mesh = trimesh.util.concatenate([provider_base, torso, low_outlier])
    mesh.export(path)


def _request(
    tmp_path: Path,
    *,
    body_writer=_write_body_glb,
) -> FigurineAssemblyRequest:
    body_path = tmp_path / "body.glb"
    base_path = tmp_path / "named-base.stl"
    body_writer(body_path)
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
    # The body must float a clearance gap above the base top plane so the
    # print service can edit away any provider-added plinth before joining.
    assert metrics["bodyBaseClearanceGapMm"] == pytest.approx(10.0)
    assert metrics["bodyBoundsMm"]["min"]["z"] == pytest.approx(
        metrics["baseTopPlaneZMm"] + metrics["bodyBaseClearanceGapMm"],
        abs=0.001,
    )
    assert metrics["bodyPlacementContact"]["targetContactZMm"] == pytest.approx(
        metrics["baseTopPlaneZMm"] + metrics["bodyBaseClearanceGapMm"],
        abs=0.001,
    )
    assert metrics["bodyPlacementContact"]["method"] == "lowest_bounds_broad_footprint"
    # base 24mm + 10mm gap + 150mm body
    assert metrics["assembledExtentsMm"]["z"] == pytest.approx(184.0, abs=0.01)


def test_assembly_seats_provider_base_instead_of_low_outlier(
    tmp_path: Path,
) -> None:
    response = assemble_figurine_package(
        _request(
            tmp_path,
            body_writer=_write_body_with_provider_base_and_low_outlier_glb,
        ),
        storage=LocalFilesystemStorage(),
    )

    metrics = response["metrics"]
    target_contact_z = (
        metrics["baseTopPlaneZMm"] + metrics["bodyBaseClearanceGapMm"]
    )
    contact = metrics["bodyPlacementContact"]

    assert contact["method"] == "lowest_broad_footprint"
    assert contact["ignoredLowerGeometryMm"] > 1.0
    assert contact["targetContactZMm"] == pytest.approx(target_contact_z, abs=0.001)
    assert metrics["bodyBoundsMm"]["min"]["z"] < target_contact_z - 1.0
    assert any("isolated lower geometry" in warning for warning in response["warnings"])


def test_assembly_rejects_missing_body_input(tmp_path: Path) -> None:
    request = _request(tmp_path)
    request.source_preview_glb_path = str(tmp_path / "missing.glb")

    with pytest.raises(FileNotFoundError):
        assemble_figurine_package(request, storage=LocalFilesystemStorage())
