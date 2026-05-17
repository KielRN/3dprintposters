import json

from .color_packages import build_color_package_bundle
from .depth import (
    apply_image_window_edge_fade,
    get_depth_provider,
    heightmap_to_image_bytes,
    resize_heightmap_to_shape,
)
from .image_pipeline import fit_image_to_aspect, load_validated_rgb_image
from .metadata import build_artifact_metadata
from .models import (
    PackageReadinessSummary,
    PrintFileArtifactPaths,
    PrintFileGenerationRequest,
    PrintFileGenerationResponse,
)
from .printability import evaluate_printability, require_printable
from .provider_policy import provider_policy_warning
from .preview import color_preview_glb_bytes
from .relief import binary_stl_bytes, build_closed_relief_mesh
from .storage import StorageAdapter, artifact_path


def build_artifact_paths(output_prefix: str) -> PrintFileArtifactPaths:
    return PrintFileArtifactPaths(
        model_stl=artifact_path(output_prefix, "model.stl"),
        heightmap_png=artifact_path(output_prefix, "heightmap.png"),
        preview_glb=artifact_path(output_prefix, "preview.glb"),
        metadata_json=artifact_path(output_prefix, "metadata.json"),
        full_color_3mf=artifact_path(output_prefix, "full-color/print-package.3mf"),
        full_color_obj=artifact_path(output_prefix, "full-color/model.obj"),
        full_color_obj_mtl=artifact_path(output_prefix, "full-color/model.mtl"),
        full_color_texture_png=artifact_path(output_prefix, "full-color/texture.png"),
        full_color_vrml=artifact_path(output_prefix, "full-color/model.wrl"),
        full_color_ply=artifact_path(output_prefix, "full-color/model.ply"),
        filament_palette_json=artifact_path(output_prefix, "filament-painting/palette.json"),
        filament_layer_swaps_txt=artifact_path(output_prefix, "filament-painting/layer-swaps.txt"),
        filament_print_settings_json=artifact_path(
            output_prefix,
            "filament-painting/print-settings.json",
        ),
        filament_preview_png=artifact_path(output_prefix, "filament-painting/preview.png"),
    )


def build_debug_artifact_paths(
    output_prefix: str,
    artifact_names: list[str],
) -> dict[str, str]:
    return {
        name: artifact_path(output_prefix, f"debug/{name}")
        for name in sorted(artifact_names)
    }


def generate_print_file_bundle(
    request: PrintFileGenerationRequest,
    *,
    storage: StorageAdapter,
) -> PrintFileGenerationResponse:
    artifact_paths = build_artifact_paths(request.output_prefix)
    source_bytes = storage.read_bytes(request.selected_image_path)
    source_image = load_validated_rgb_image(
        source_bytes,
        max_pixels=request.relief.max_source_pixels,
    )
    normalized_image = fit_image_to_aspect(
        source_image,
        target_width_mm=request.dimensions.image_window_width_mm,
        target_height_mm=request.dimensions.image_window_height_mm,
        target_width_px=request.relief.target_width_px,
    )
    geometry_analysis_image = fit_image_to_aspect(
        source_image,
        target_width_mm=request.dimensions.image_window_width_mm,
        target_height_mm=request.dimensions.image_window_height_mm,
        target_width_px=request.relief.geometry_analysis_width_px,
    )

    height_provider = get_depth_provider(request.relief.height_provider)
    heightmap_kwargs = {
        "base_thickness_mm": request.relief.base_thickness_mm,
        "min_relief_mm": request.relief.min_relief_mm,
        "max_relief_mm": request.relief.max_relief_mm,
        "contrast": request.relief.contrast,
        "gamma": request.relief.gamma,
        "post_smooth_radius_px": request.relief.post_smooth_radius_px,
    }
    if request.relief.height_provider == "masked_depth_detail_blend":
        heightmap_kwargs["detail_source"] = request.relief.detail_source
        heightmap_kwargs["detail_weight"] = request.relief.detail_weight
        heightmap_kwargs["surface_intent_policy"] = (
            request.style_metadata.surface_intent_policy.model_dump(mode="json")
        )

    heightmap = height_provider.generate(
        geometry_analysis_image.image,
        **heightmap_kwargs,
    )
    debug_artifacts = dict(heightmap.debug_artifacts or {})
    heightmap = resize_heightmap_to_shape(
        heightmap,
        target_shape=(
            normalized_image.normalized_height_px,
            normalized_image.normalized_width_px,
        ),
    )
    heightmap = apply_image_window_edge_fade(heightmap)
    if debug_artifacts:
        debug_artifacts["final-heightmap.png"] = heightmap_to_image_bytes(
            heightmap,
            bit_depth=request.relief.heightmap_png_bit_depth,
        )
        artifact_paths.debug_artifacts = build_debug_artifact_paths(
            request.output_prefix,
            list(debug_artifacts),
        )
    provider_settings = None
    if request.relief.height_provider == "masked_depth_detail_blend":
        provider_settings = {
            "detail_source": request.relief.detail_source,
            "detail_weight": request.relief.detail_weight,
            "debug_artifacts": "enabled",
            "face_pit_guard": "enabled",
            "geometry_input": "subject_aware_cleanup",
            "geometry_analysis_width_px": request.relief.geometry_analysis_width_px,
            "mesh_target_width_px": request.relief.target_width_px,
            "portrait_nose_boost": "disabled",
            "portrait_surface_smoothing": "expanded_face_oval",
            "surface_intent_detail_gating": "enabled",
            "surface_intent_masks": "inferred_v1",
            "surface_intent_texture": "request_gated",
        }
    mesh = build_closed_relief_mesh(
        heightmap.values,
        width_mm=request.dimensions.target_width_mm,
        height_mm=request.dimensions.target_height_mm,
        image_window_width_mm=request.dimensions.image_window_width_mm,
        image_window_height_mm=request.dimensions.image_window_height_mm,
        border_mm=request.dimensions.border_mm,
        border_height_mm=request.relief.base_thickness_mm,
    )
    stl_bytes = binary_stl_bytes(mesh)
    preview_glb_bytes = color_preview_glb_bytes(mesh, normalized_image.image)
    printability = evaluate_printability(
        request=request,
        mesh=mesh,
        heightmap=heightmap,
        binary_stl_size=len(stl_bytes),
    )
    require_printable(printability)
    policy_warning = provider_policy_warning(heightmap.provider)
    color_package = build_color_package_bundle(
        request=request,
        mesh=mesh,
        source_image=normalized_image.image,
    )

    metadata = build_artifact_metadata(
        job_id=request.job_id,
        uid=request.uid,
        normalized_image=normalized_image,
        geometry_analysis_image=geometry_analysis_image,
        heightmap=heightmap,
        mesh=mesh,
        binary_stl_size=len(stl_bytes),
        base_thickness_mm=request.relief.base_thickness_mm,
        provider_settings=provider_settings,
        package_metadata=color_package.metadata,
        style_metadata=request.style_metadata.to_metadata(),
    )

    storage.write_bytes(
        artifact_paths.model_stl,
        stl_bytes,
        content_type="model/stl",
    )
    storage.write_bytes(
        artifact_paths.preview_glb,
        preview_glb_bytes,
        content_type="model/gltf-binary",
    )
    storage.write_bytes(
        artifact_paths.heightmap_png,
        heightmap_to_image_bytes(
            heightmap,
            bit_depth=request.relief.heightmap_png_bit_depth,
        ),
        content_type="image/png",
    )
    storage.write_bytes(
        artifact_paths.metadata_json,
        json.dumps(metadata.to_dict(), indent=2, sort_keys=True).encode("utf-8"),
        content_type="application/json",
    )
    for name, data in debug_artifacts.items():
        storage.write_bytes(
            artifact_paths.debug_artifacts[name],
            data,
            content_type="image/png",
        )
    storage.write_bytes(
        artifact_paths.full_color_3mf,
        color_package.three_mf,
        content_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    )
    storage.write_bytes(
        artifact_paths.full_color_obj,
        color_package.obj,
        content_type="model/obj",
    )
    storage.write_bytes(
        artifact_paths.full_color_obj_mtl,
        color_package.obj_mtl,
        content_type="text/plain",
    )
    storage.write_bytes(
        artifact_paths.full_color_texture_png,
        color_package.texture_png,
        content_type="image/png",
    )
    storage.write_bytes(
        artifact_paths.full_color_vrml,
        color_package.vrml,
        content_type="model/vrml",
    )
    storage.write_bytes(
        artifact_paths.full_color_ply,
        color_package.ply,
        content_type="application/octet-stream",
    )
    storage.write_bytes(
        artifact_paths.filament_palette_json,
        color_package.filament_palette_json,
        content_type="application/json",
    )
    storage.write_bytes(
        artifact_paths.filament_layer_swaps_txt,
        color_package.filament_layer_swaps_txt,
        content_type="text/plain",
    )
    storage.write_bytes(
        artifact_paths.filament_print_settings_json,
        color_package.filament_print_settings_json,
        content_type="application/json",
    )
    storage.write_bytes(
        artifact_paths.filament_preview_png,
        color_package.filament_preview_png,
        content_type="image/png",
    )
    package_warnings = [
        *printability.warnings,
        *([policy_warning] if policy_warning else []),
    ]

    return PrintFileGenerationResponse(
        job_id=request.job_id,
        status="generated",
        artifact_paths=artifact_paths,
        printability=PackageReadinessSummary(
            status="passed_with_warnings" if package_warnings else "passed",
            checks=[
                "source_image_validated",
                "image_normalized_to_5x7_window",
                f"{heightmap.provider}_heightmap_generated",
                "closed_binary_stl_generated",
                "color_preview_glb_generated",
                *printability.checks,
                *color_package.checks,
                "metadata_written",
                *(["debug_artifacts_written"] if debug_artifacts else []),
            ],
            warnings=package_warnings,
        ),
    )
