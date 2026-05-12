import io
import json
import zipfile

import numpy as np
from PIL import Image

from app.color_packages import build_color_package_bundle
from app.models import FilamentPaintingSettings, PrintFileGenerationRequest
from app.relief import build_closed_relief_mesh


def test_color_package_bundle_exports_partner_formats_and_filament_guides() -> None:
    heightmap = np.array(
        [
            [1.6, 2.0],
            [3.0, 4.2],
        ],
        dtype=np.float32,
    )
    mesh = build_closed_relief_mesh(
        heightmap,
        width_mm=139.7,
        height_mm=190.5,
        image_window_width_mm=127.0,
        image_window_height_mm=177.8,
        border_mm=6.35,
        border_height_mm=1.2,
    )
    image = Image.new("RGB", (2, 2))
    image.putdata(
        [
            (255, 0, 0),
            (0, 255, 0),
            (0, 0, 255),
            (255, 255, 255),
        ]
    )
    request = PrintFileGenerationRequest(
        job_id="job_color",
        uid="user_color",
        selected_image_path="source.png",
        output_prefix="print-files/user_color/job_color",
        filament_painting=FilamentPaintingSettings(max_filament_colors=3),
    )

    bundle = build_color_package_bundle(request=request, mesh=mesh, source_image=image)

    assert bundle.obj.startswith(b"# 3DPrintPosters textured relief OBJ")
    assert b"mtllib model.mtl" in bundle.obj
    assert b"map_Kd texture.png" in bundle.obj_mtl
    assert bundle.vrml.startswith(b"#VRML V2.0 utf8")
    assert bundle.ply.startswith(b"ply\nformat ascii 1.0")
    assert bundle.texture_png.startswith(b"\x89PNG")
    assert bundle.filament_preview_png.startswith(b"\x89PNG")
    assert "full_color_3mf_generated" in bundle.checks
    assert "filament_print_settings_generated" in bundle.checks

    with zipfile.ZipFile(io.BytesIO(bundle.three_mf)) as package:
        assert set(package.namelist()) == {
            "[Content_Types].xml",
            "_rels/.rels",
            "3D/3dmodel.model",
        }
        model_xml = package.read("3D/3dmodel.model").decode("utf-8")
    assert "<basematerials" in model_xml
    assert "<triangle" in model_xml

    palette = json.loads(bundle.filament_palette_json)
    settings = json.loads(bundle.filament_print_settings_json)
    assert palette["max_filament_colors"] == 3
    assert 1 <= len(palette["colors"]) <= 3
    assert settings["physical_dimensions_mm"]["width"] == 139.7
    assert "Layer swaps:" in bundle.filament_layer_swaps_txt.decode("utf-8")
    assert bundle.metadata["full_color"]["formats"] == ["3mf", "obj", "vrml", "ply"]
    assert bundle.metadata["filament_painting"]["palette_color_count"] >= 1
