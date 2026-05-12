import io
import json
import math
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree as ET

from PIL import Image

from .image_pipeline import image_to_png_bytes
from .models import PrintFileGenerationRequest
from .relief import ReliefMesh, Vertex


CORE_3MF_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"


@dataclass(frozen=True)
class PaletteColor:
    id: str
    hex: str
    rgb: tuple[int, int, int]
    pixel_share: float


@dataclass(frozen=True)
class ColorPackageBundle:
    three_mf: bytes
    obj: bytes
    obj_mtl: bytes
    texture_png: bytes
    vrml: bytes
    ply: bytes
    filament_palette_json: bytes
    filament_layer_swaps_txt: bytes
    filament_print_settings_json: bytes
    filament_preview_png: bytes
    metadata: dict[str, object]
    checks: list[str]


def build_color_package_bundle(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    source_image: Image.Image,
) -> ColorPackageBundle:
    rgb_image = source_image.convert("RGB")
    texture_png = image_to_png_bytes(rgb_image)
    full_color_palette = _quantized_palette(rgb_image, max_colors=64)
    filament_palette = _quantized_palette(
        rgb_image,
        max_colors=request.filament_painting.max_filament_colors,
    )
    filament_preview = _quantized_preview_png(
        rgb_image,
        max_colors=request.filament_painting.max_filament_colors,
    )
    vertex_uvs = [_uv_for_vertex(vertex, mesh) for vertex in mesh.vertices]
    vertex_colors = [_sample_rgb(rgb_image, *uv) for uv in vertex_uvs]
    face_palette_indexes = [
        _nearest_palette_index(
            _face_average_color(face, vertex_colors),
            full_color_palette,
        )
        for face in mesh.faces
    ]
    layer_swaps = _filament_layer_swaps(
        request=request,
        mesh=mesh,
        palette=filament_palette,
    )
    print_settings = _filament_print_settings(
        request=request,
        mesh=mesh,
        palette=filament_palette,
        layer_swaps=layer_swaps,
    )

    metadata = {
        "full_color": {
            "material_profile": request.full_color_material_profile,
            "formats": ["3mf", "obj", "vrml", "ply"],
            "texture": {
                "path": "full-color/texture.png",
                "width_px": rgb_image.width,
                "height_px": rgb_image.height,
                "uv_mapping": "clamped_image_window_xy",
            },
            "color_strategy": "image-window texture with vertex-color fallbacks",
            "material_palette_size": len(full_color_palette),
        },
        "filament_painting": {
            "material_profile": request.filament_material_profile,
            "palette_color_count": len(filament_palette),
            "layer_height_mm": request.filament_painting.layer_height_mm,
            "nozzle_diameter_mm": request.filament_painting.nozzle_diameter_mm,
            "prefer_single_nozzle_swaps": (
                request.filament_painting.prefer_single_nozzle_swaps
            ),
            "layer_swap_count": len(layer_swaps),
        },
    }

    return ColorPackageBundle(
        three_mf=_three_mf_bytes(mesh, full_color_palette, face_palette_indexes),
        obj=_obj_bytes(mesh, vertex_uvs, vertex_colors),
        obj_mtl=_obj_mtl_bytes(),
        texture_png=texture_png,
        vrml=_vrml_bytes(mesh, vertex_colors),
        ply=_ply_bytes(mesh, vertex_colors),
        filament_palette_json=json.dumps(
            _filament_palette_document(
                request=request,
                palette=filament_palette,
                layer_swaps=layer_swaps,
            ),
            indent=2,
            sort_keys=True,
        ).encode("utf-8"),
        filament_layer_swaps_txt=_layer_swaps_text(
            request=request,
            palette=filament_palette,
            layer_swaps=layer_swaps,
        ).encode("utf-8"),
        filament_print_settings_json=json.dumps(
            print_settings,
            indent=2,
            sort_keys=True,
        ).encode("utf-8"),
        filament_preview_png=filament_preview,
        metadata=metadata,
        checks=[
            "full_color_3mf_generated",
            "full_color_obj_texture_package_generated",
            "full_color_vrml_generated",
            "full_color_ply_generated",
            "filament_palette_generated",
            "filament_layer_swaps_generated",
            "filament_print_settings_generated",
            "filament_preview_generated",
        ],
    )


def _quantized_palette(image: Image.Image, *, max_colors: int) -> list[PaletteColor]:
    color_count = max(1, min(max_colors, 256))
    quantized = image.convert("RGB").quantize(
        colors=color_count,
        method=Image.Quantize.MEDIANCUT,
    )
    raw_palette = quantized.getpalette() or []
    total_pixels = max(1, image.width * image.height)
    counts = quantized.getcolors(total_pixels) or []
    colors: list[PaletteColor] = []

    for output_index, (count, palette_index) in enumerate(
        sorted(counts, key=lambda item: (-item[0], item[1])),
        start=1,
    ):
        offset = palette_index * 3
        rgb = tuple(raw_palette[offset : offset + 3])
        if len(rgb) != 3:
            continue
        rgb_tuple = (int(rgb[0]), int(rgb[1]), int(rgb[2]))
        colors.append(
            PaletteColor(
                id=f"color_{output_index}",
                hex=_rgb_to_hex(rgb_tuple),
                rgb=rgb_tuple,
                pixel_share=round(count / total_pixels, 6),
            )
        )

    if colors:
        return colors

    fallback = image.convert("RGB").resize((1, 1)).getpixel((0, 0))
    return [
        PaletteColor(
            id="color_1",
            hex=_rgb_to_hex(fallback),
            rgb=fallback,
            pixel_share=1.0,
        )
    ]


def _quantized_preview_png(image: Image.Image, *, max_colors: int) -> bytes:
    quantized = image.convert("RGB").quantize(
        colors=max(1, min(max_colors, 256)),
        method=Image.Quantize.MEDIANCUT,
    )
    return image_to_png_bytes(quantized.convert("RGB"))


def _uv_for_vertex(vertex: Vertex, mesh: ReliefMesh) -> tuple[float, float]:
    window_width = mesh.image_window_width_mm or mesh.width_mm
    window_height = mesh.image_window_height_mm or mesh.height_mm
    border = mesh.border_mm
    u = _clamp((vertex[0] - border) / window_width)
    v = _clamp((vertex[1] - border) / window_height)
    return (u, v)


def _sample_rgb(image: Image.Image, u: float, v: float) -> tuple[int, int, int]:
    x = round(_clamp(u) * (image.width - 1))
    y = round((1.0 - _clamp(v)) * (image.height - 1))
    pixel = image.getpixel((x, y))
    return (int(pixel[0]), int(pixel[1]), int(pixel[2]))


def _face_average_color(
    face: tuple[int, int, int],
    vertex_colors: list[tuple[int, int, int]],
) -> tuple[int, int, int]:
    colors = [vertex_colors[index] for index in face]
    return (
        round(sum(color[0] for color in colors) / 3),
        round(sum(color[1] for color in colors) / 3),
        round(sum(color[2] for color in colors) / 3),
    )


def _nearest_palette_index(
    rgb: tuple[int, int, int],
    palette: list[PaletteColor],
) -> int:
    distances = [
        (
            (rgb[0] - color.rgb[0]) ** 2
            + (rgb[1] - color.rgb[1]) ** 2
            + (rgb[2] - color.rgb[2]) ** 2,
            index,
        )
        for index, color in enumerate(palette)
    ]
    return min(distances)[1]


def _three_mf_bytes(
    mesh: ReliefMesh,
    palette: list[PaletteColor],
    face_palette_indexes: list[int],
) -> bytes:
    ET.register_namespace("", CORE_3MF_NS)
    model = ET.Element(
        f"{{{CORE_3MF_NS}}}model",
        {"unit": "millimeter", "xml:lang": "en-US"},
    )
    resources = ET.SubElement(model, f"{{{CORE_3MF_NS}}}resources")
    materials = ET.SubElement(resources, f"{{{CORE_3MF_NS}}}basematerials", {"id": "1"})
    for color in palette:
        ET.SubElement(
            materials,
            f"{{{CORE_3MF_NS}}}base",
            {"name": color.id, "displaycolor": f"{color.hex}FF"},
        )

    obj = ET.SubElement(resources, f"{{{CORE_3MF_NS}}}object", {"id": "2", "type": "model"})
    mesh_el = ET.SubElement(obj, f"{{{CORE_3MF_NS}}}mesh")
    vertices = ET.SubElement(mesh_el, f"{{{CORE_3MF_NS}}}vertices")
    for vertex in mesh.vertices:
        ET.SubElement(
            vertices,
            f"{{{CORE_3MF_NS}}}vertex",
            {
                "x": _format_float(vertex[0]),
                "y": _format_float(vertex[1]),
                "z": _format_float(vertex[2]),
            },
        )

    triangles = ET.SubElement(mesh_el, f"{{{CORE_3MF_NS}}}triangles")
    for face, palette_index in zip(mesh.faces, face_palette_indexes, strict=True):
        ET.SubElement(
            triangles,
            f"{{{CORE_3MF_NS}}}triangle",
            {
                "v1": str(face[0]),
                "v2": str(face[1]),
                "v3": str(face[2]),
                "pid": "1",
                "p1": str(palette_index),
                "p2": str(palette_index),
                "p3": str(palette_index),
            },
        )

    build = ET.SubElement(model, f"{{{CORE_3MF_NS}}}build")
    ET.SubElement(build, f"{{{CORE_3MF_NS}}}item", {"objectid": "2"})
    model_xml = ET.tostring(model, encoding="utf-8", xml_declaration=True)

    content_types = ET.Element(f"{{{CONTENT_TYPES_NS}}}Types")
    ET.SubElement(
        content_types,
        f"{{{CONTENT_TYPES_NS}}}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ET.SubElement(
        content_types,
        f"{{{CONTENT_TYPES_NS}}}Default",
        {"Extension": "model", "ContentType": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"},
    )
    content_types_xml = ET.tostring(content_types, encoding="utf-8", xml_declaration=True)

    relationships = ET.Element(f"{{{RELATIONSHIPS_NS}}}Relationships")
    ET.SubElement(
        relationships,
        f"{{{RELATIONSHIPS_NS}}}Relationship",
        {
            "Target": "/3D/3dmodel.model",
            "Id": "rel-1",
            "Type": "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel",
        },
    )
    relationships_xml = ET.tostring(relationships, encoding="utf-8", xml_declaration=True)

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml", content_types_xml)
        package.writestr("_rels/.rels", relationships_xml)
        package.writestr("3D/3dmodel.model", model_xml)
    return archive.getvalue()


def _obj_bytes(
    mesh: ReliefMesh,
    vertex_uvs: list[tuple[float, float]],
    vertex_colors: list[tuple[int, int, int]],
) -> bytes:
    lines = [
        "# 3DPrintPosters textured relief OBJ",
        "mtllib model.mtl",
        "o 3dprintposters_relief",
    ]
    for vertex, color in zip(mesh.vertices, vertex_colors, strict=True):
        lines.append(
            "v "
            f"{_format_float(vertex[0])} {_format_float(vertex[1])} {_format_float(vertex[2])} "
            f"{_format_float(color[0] / 255)} {_format_float(color[1] / 255)} "
            f"{_format_float(color[2] / 255)}"
        )
    for u, v in vertex_uvs:
        lines.append(f"vt {_format_float(u)} {_format_float(v)}")

    lines.append("usemtl poster_texture")
    for face in mesh.faces:
        a, b, c = (index + 1 for index in face)
        lines.append(f"f {a}/{a} {b}/{b} {c}/{c}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _obj_mtl_bytes() -> bytes:
    return (
        "newmtl poster_texture\n"
        "Ka 1.000000 1.000000 1.000000\n"
        "Kd 1.000000 1.000000 1.000000\n"
        "Ks 0.000000 0.000000 0.000000\n"
        "d 1.000000\n"
        "illum 1\n"
        "map_Kd texture.png\n"
    ).encode("utf-8")


def _vrml_bytes(mesh: ReliefMesh, vertex_colors: list[tuple[int, int, int]]) -> bytes:
    lines = [
        "#VRML V2.0 utf8",
        "Shape {",
        "  geometry IndexedFaceSet {",
        "    colorPerVertex TRUE",
        "    coord Coordinate {",
        "      point [",
    ]
    for vertex in mesh.vertices:
        lines.append(
            "        "
            f"{_format_float(vertex[0])} {_format_float(vertex[1])} {_format_float(vertex[2])},"
        )
    lines.extend(
        [
            "      ]",
            "    }",
            "    color Color {",
            "      color [",
        ]
    )
    for color in vertex_colors:
        lines.append(
            "        "
            f"{_format_float(color[0] / 255)} {_format_float(color[1] / 255)} "
            f"{_format_float(color[2] / 255)},"
        )
    lines.extend(
        [
            "      ]",
            "    }",
            "    coordIndex [",
        ]
    )
    for face in mesh.faces:
        lines.append(f"      {face[0]}, {face[1]}, {face[2]}, -1,")
    lines.extend(
        [
            "    ]",
            "  }",
            "}",
        ]
    )
    return ("\n".join(lines) + "\n").encode("utf-8")


def _ply_bytes(mesh: ReliefMesh, vertex_colors: list[tuple[int, int, int]]) -> bytes:
    lines = [
        "ply",
        "format ascii 1.0",
        "comment generated by 3DPrintPosters print-file-generator",
        f"element vertex {len(mesh.vertices)}",
        "property float x",
        "property float y",
        "property float z",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        f"element face {len(mesh.faces)}",
        "property list uchar int vertex_indices",
        "end_header",
    ]
    for vertex, color in zip(mesh.vertices, vertex_colors, strict=True):
        lines.append(
            f"{_format_float(vertex[0])} {_format_float(vertex[1])} "
            f"{_format_float(vertex[2])} {color[0]} {color[1]} {color[2]}"
        )
    for face in mesh.faces:
        lines.append(f"3 {face[0]} {face[1]} {face[2]}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _filament_layer_swaps(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    palette: list[PaletteColor],
) -> list[dict[str, object]]:
    if len(palette) <= 1:
        return []

    sorted_palette = sorted(palette, key=lambda color: _luminance(color.rgb))
    layer_height = request.filament_painting.layer_height_mm
    base_z = request.relief.base_thickness_mm
    max_z = mesh.max_z_mm
    relief_span = max(max_z - base_z, layer_height)
    swaps: list[dict[str, object]] = []

    for index, color in enumerate(sorted_palette[1:], start=1):
        z_height = base_z + relief_span * index / max(1, len(sorted_palette) - 1)
        layer = max(1, math.ceil(z_height / layer_height))
        swaps.append(
            {
                "layer": layer,
                "z_height_mm": round(layer * layer_height, 3),
                "filament_id": color.id,
                "hex": color.hex,
                "rgb": list(color.rgb),
            }
        )
    return swaps


def _filament_palette_document(
    *,
    request: PrintFileGenerationRequest,
    palette: list[PaletteColor],
    layer_swaps: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "material_profile": request.filament_material_profile,
        "strategy": "image_quantized_palette_for_height_based_layer_swaps",
        "max_filament_colors": request.filament_painting.max_filament_colors,
        "colors": [_palette_color_dict(color) for color in palette],
        "layer_swaps": layer_swaps,
    }


def _layer_swaps_text(
    *,
    request: PrintFileGenerationRequest,
    palette: list[PaletteColor],
    layer_swaps: list[dict[str, object]],
) -> str:
    lines = [
        "3DPrintPosters filament painting guide",
        f"Material profile: {request.filament_material_profile}",
        f"Layer height: {request.filament_painting.layer_height_mm:.3f} mm",
        f"Nozzle diameter: {request.filament_painting.nozzle_diameter_mm:.3f} mm",
        "",
        "Palette:",
    ]
    for color in palette:
        lines.append(f"- {color.id}: {color.hex} ({color.pixel_share:.1%} of image)")

    if not layer_swaps:
        lines.extend(["", "Layer swaps:", "- No swaps required for a one-color palette."])
        return "\n".join(lines) + "\n"

    starting_color = sorted(palette, key=lambda color: _luminance(color.rgb))[0]
    lines.extend(
        [
            "",
            "Layer swaps:",
            f"- Start with {starting_color.id} {starting_color.hex}.",
        ]
    )
    for swap in layer_swaps:
        lines.append(
            "- Layer "
            f"{swap['layer']} (~{swap['z_height_mm']:.3f} mm): "
            f"swap to {swap['filament_id']} {swap['hex']}."
        )
    return "\n".join(lines) + "\n"


def _filament_print_settings(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    palette: list[PaletteColor],
    layer_swaps: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "material_profile": request.filament_material_profile,
        "layer_height_mm": request.filament_painting.layer_height_mm,
        "nozzle_diameter_mm": request.filament_painting.nozzle_diameter_mm,
        "prefer_single_nozzle_swaps": request.filament_painting.prefer_single_nozzle_swaps,
        "physical_dimensions_mm": {
            "width": mesh.width_mm,
            "height": mesh.height_mm,
            "max_z": mesh.max_z_mm,
            "image_window_width": mesh.image_window_width_mm,
            "image_window_height": mesh.image_window_height_mm,
            "border": mesh.border_mm,
        },
        "relief_settings": {
            "base_thickness_mm": request.relief.base_thickness_mm,
            "min_relief_mm": request.relief.min_relief_mm,
            "max_relief_mm": request.relief.max_relief_mm,
            "height_provider": request.relief.height_provider,
        },
        "palette": [_palette_color_dict(color) for color in palette],
        "layer_swaps": layer_swaps,
    }


def _palette_color_dict(color: PaletteColor) -> dict[str, object]:
    return {
        "id": color.id,
        "hex": color.hex,
        "rgb": list(color.rgb),
        "pixel_share": color.pixel_share,
    }


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def _luminance(rgb: tuple[int, int, int]) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _format_float(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")
