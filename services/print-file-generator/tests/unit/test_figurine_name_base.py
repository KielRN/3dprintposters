import json
from pathlib import Path

import numpy as np
import pytest

from app.figurine_name_base import (
    MAX_NAME_CHARACTERS,
    NamePanel,
    NameValidationError,
    build_name_text_mesh,
    compose_named_base,
    validate_sign_name,
)

ASSET_DIR = (
    Path(__file__).resolve().parents[2]
    / "assets"
    / "figurine-bases"
    / "figurine-square-v1"
)


def _panel() -> NamePanel:
    manifest = json.loads((ASSET_DIR / "base.manifest.json").read_text(encoding="utf-8"))
    return NamePanel.from_manifest(manifest)


class TestValidateSignName:
    def test_accepts_simple_name(self) -> None:
        assert validate_sign_name("Elliott") == "Elliott"

    def test_trims_and_collapses_whitespace(self) -> None:
        assert validate_sign_name("  Mary   Jo  ") == "Mary Jo"

    def test_accepts_hyphen_apostrophe_period(self) -> None:
        assert validate_sign_name("O'Neil-Jr.") == "O'Neil-Jr."

    def test_rejects_empty(self) -> None:
        with pytest.raises(NameValidationError):
            validate_sign_name("   ")

    def test_rejects_too_long(self) -> None:
        with pytest.raises(NameValidationError):
            validate_sign_name("A" * (MAX_NAME_CHARACTERS + 1))

    def test_rejects_disallowed_characters(self) -> None:
        for bad in ["<script>", "name!", "héllo", "名前"]:
            with pytest.raises(NameValidationError):
                validate_sign_name(bad)

    def test_rejects_leading_punctuation(self) -> None:
        with pytest.raises(NameValidationError):
            validate_sign_name("-Elliott")


class TestNamePanel:
    def test_loads_from_square_asset_manifest(self) -> None:
        panel = _panel()
        assert panel.max_text_width_mm > 30.0
        assert panel.max_text_height_in_plane_mm > 10.0
        assert panel.proud_of_panel_mm > 1.0
        assert panel.embedded_behind_panel_mm > 0.1
        np.testing.assert_allclose(np.linalg.norm(panel.normal), 1.0, atol=1e-6)


class TestBuildNameTextMesh:
    def test_lettering_sits_on_panel_plane(self) -> None:
        panel = _panel()
        result = build_name_text_mesh("Elliott", panel)
        d = result.mesh.vertices @ (panel.normal / np.linalg.norm(panel.normal))
        assert d.max() == pytest.approx(
            panel.panel_offset + panel.proud_of_panel_mm, abs=0.05
        )
        assert d.min() == pytest.approx(
            panel.panel_offset - panel.embedded_behind_panel_mm, abs=0.05
        )

    def test_lettering_stays_inside_panel_rect(self) -> None:
        panel = _panel()
        for name in ["Jo", "Elliott", "Maximilliana"]:
            mesh = build_name_text_mesh(name, panel).mesh
            assert mesh.bounds[0][0] >= panel.rect_x_min
            assert mesh.bounds[1][0] <= panel.rect_x_max
            assert mesh.bounds[0][2] >= panel.rect_z_min
            assert mesh.bounds[1][2] <= panel.rect_z_max

    def test_long_name_shrinks_but_stays_legible(self) -> None:
        panel = _panel()
        short = build_name_text_mesh("Jo", panel)
        long = build_name_text_mesh("Maximilliana", panel)
        assert long.metadata["capHeightMm"] < short.metadata["capHeightMm"]
        assert long.metadata["capHeightMm"] >= 4.0


class TestComposeNamedBase:
    def test_composed_base_is_watertight_and_in_footprint(self) -> None:
        result = compose_named_base(ASSET_DIR, "Elliott")
        assert result.metadata["composed"]["watertight"] is True
        base_extents = np.array([105.24, 105.24, 24.0])
        np.testing.assert_allclose(
            result.metadata["composed"]["extentsMm"], base_extents, atol=0.05
        )

    def test_rejects_invalid_name_before_geometry(self) -> None:
        with pytest.raises(NameValidationError):
            compose_named_base(ASSET_DIR, "bad<name>")
