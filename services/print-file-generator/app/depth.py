from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .portrait_regions import PortraitRegionMasks, analyze_portrait_regions
from .providers.base import ProviderAudit


POSTER_RELIEF_BANDS = 9
BASE_SMOOTH_RADIUS_PX = 2.0
TERRACE_SMOOTH_RADIUS_PX = 0.7
EDGE_SMOOTH_RADIUS_PX = 1.1
EDGE_DETAIL_WEIGHT = 0.18
HeightmapProviderName = Literal[
    "posterized_luminance",
    "continuous_luminance",
    "lithophane_baseline",
    "depth_anything_v2_small",
    "depth_anything_v2_small_bas_relief",
    "segformer_masked_depth",
    "masked_depth_detail_blend",
    "triposr_sidecar",
]


@dataclass(frozen=True)
class Heightmap:
    values: np.ndarray
    min_height_mm: float
    max_height_mm: float
    provider: str
    provider_audit: dict[str, dict[str, object]] | None = None
    segmentation_status: dict[str, object] | None = None
    face_analysis_status: dict[str, object] | None = None
    debug_artifacts: dict[str, bytes] | None = None


@dataclass(frozen=True)
class DepthInferenceResult:
    depth: np.ndarray
    audit: ProviderAudit | None = None


@dataclass(frozen=True)
class SubjectMaskResult:
    mask: np.ndarray
    status: Literal["ok", "empty_mask", "full_image_mask", "api_failure"]
    audit: ProviderAudit | None = None
    mask_coverage: float = 0.0
    foreground_labels: tuple[str, ...] = ()
    raw_segment_count: int = 0


class LuminanceDepthProvider:
    name = "posterized_luminance"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.0,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        smoothed_luminance = ImageOps.autocontrast(
            grayscale.filter(ImageFilter.GaussianBlur(radius=BASE_SMOOTH_RADIUS_PX)),
            cutoff=1,
        )
        luminance = _apply_tone_curve(
            _image_to_unit_array(smoothed_luminance),
            contrast=contrast,
            gamma=gamma,
        )

        posterized = np.round(luminance * (POSTER_RELIEF_BANDS - 1)) / (
            POSTER_RELIEF_BANDS - 1
        )
        posterized_image = Image.fromarray(
            (posterized * 255.0).clip(0, 255).astype(np.uint8),
            mode="L",
        ).filter(ImageFilter.GaussianBlur(radius=TERRACE_SMOOTH_RADIUS_PX))
        posterized = _image_to_unit_array(posterized_image)

        edge_detail = _image_to_unit_array(
            grayscale.filter(ImageFilter.FIND_EDGES).filter(
                ImageFilter.GaussianBlur(radius=EDGE_SMOOTH_RADIUS_PX)
            )
        )
        edge_detail = edge_detail / max(float(np.max(edge_detail)), 1e-6)

        printable_depth = (
            1.0 - posterized + EDGE_DETAIL_WEIGHT * edge_detail
        ).clip(0.0, 1.0)
        printable_depth = _smooth_unit_array(printable_depth, post_smooth_radius_px)
        relief = min_relief_mm + printable_depth * (max_relief_mm - min_relief_mm)
        heights = base_thickness_mm + relief

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )


class ContinuousLuminanceDepthProvider:
    name = "continuous_luminance"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        smoothed_luminance = ImageOps.autocontrast(
            grayscale.filter(ImageFilter.GaussianBlur(radius=1.2)),
            cutoff=1,
        )
        luminance = _apply_tone_curve(
            _image_to_unit_array(smoothed_luminance),
            contrast=contrast,
            gamma=gamma,
        )

        edge_detail = _normalized_edge_detail(grayscale)
        printable_depth = (1.0 - luminance + 0.08 * edge_detail).clip(0.0, 1.0)
        printable_depth = _smooth_unit_array(printable_depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            printable_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )


class LithophaneBaselineDepthProvider:
    name = "lithophane_baseline"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.4,
    ) -> Heightmap:
        grayscale = ImageOps.grayscale(image)
        luminance = _apply_tone_curve(
            _image_to_unit_array(ImageOps.autocontrast(grayscale, cutoff=0)),
            contrast=contrast,
            gamma=gamma,
        )

        thickness = np.power(1.0 - luminance, 1.15).clip(0.0, 1.0)
        thickness = _smooth_unit_array(thickness, post_smooth_radius_px)
        heights = _depth_to_heights(
            thickness,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )


class DepthAnythingV2SmallDepthProvider:
    name = "depth_anything_v2_small"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)
        depth = _smooth_unit_array(depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(monocular_depth=depth_result.audit),
        )


class DepthAnythingV2SmallBasReliefProvider:
    name = "depth_anything_v2_small_bas_relief"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
    ) -> Heightmap:
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Apply bas-relief gradient compression
        relief_depth = _apply_bas_relief_transform(depth, compression_strength=0.75)

        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(monocular_depth=depth_result.audit),
        )


class SegformerMaskedDepthProvider:
    """Experiment 4: combine Depth Anything V2 Small with SegFormer subject masks.

    Pipeline:
    1. Run Depth Anything V2 Small for semantic depth.
    2. Run SegFormer (nvidia/segformer-b0-finetuned-ade-512-512) via the HF
       Inference API for ADE20K-class segmentation.
    3. Merge all non-background labels into a single foreground mask.
    4. Soft-blur the mask edges to avoid harsh cutout ridges.
    5. Boost subject depth, suppress background depth.
    6. Apply bas-relief gradient compression.

    Originally registered as ``sam_masked_depth``. Renamed to reflect the
    actual SegFormer-based implementation. Historical experiment artifacts
    under ``.tmp/experiments/experiment_4/sam_masked_depth/`` retain the old
    name and metadata.
    """

    name = "segformer_masked_depth"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
        subject_boost: float = 1.0,
        background_scale: float = 0.3,
        mask_blur_radius_px: float = 5.0,
        compression_strength: float = 0.75,
    ) -> Heightmap:
        # Semantic depth
        depth_result = _infer_depth_anything_v2_small_result(image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Subject mask
        subject_mask_result = _generate_subject_mask_result(
            image,
            blur_radius_px=mask_blur_radius_px,
        )
        subject_mask = subject_mask_result.mask

        # Layer: boost subject, suppress background
        layered = depth * (subject_boost * subject_mask + background_scale * (1.0 - subject_mask))
        # Re-normalize to [0, 1]
        l_min, l_max = float(np.min(layered)), float(np.max(layered))
        if l_max - l_min > 1e-6:
            layered = (layered - l_min) / (l_max - l_min)
        else:
            layered = np.zeros_like(layered)
        layered = layered.clip(0.0, 1.0).astype(np.float32)

        # Bas-relief compression
        relief_depth = _apply_bas_relief_transform(layered, compression_strength=compression_strength)
        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)

        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(
                monocular_depth=depth_result.audit,
                subject_segmentation=subject_mask_result.audit,
            ),
            segmentation_status=_segmentation_status_to_dict(subject_mask_result),
        )


class MaskedDepthDetailBlendProvider:
    """Hybrid candidate: semantic depth, subject mask, and in-mask detail.

    This is the next prototype path after the five-experiment review:
    Depth Anything supplies the low-frequency image-plane shape, SegFormer
    supplies subject/background control, and a deterministic detail source
    restores subject-only facial/local texture before bas-relief compression.
    """

    name = "masked_depth_detail_blend"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
        detail_source: Literal[
            "lithophane_baseline",
            "posterized_luminance",
        ] = "lithophane_baseline",
        detail_weight: float = 0.12,
        detail_radius_px: int = 9,
        detail_clip: float = 0.14,
        subject_boost: float = 1.0,
        background_scale: float = 0.22,
        mask_blur_radius_px: float = 5.0,
        compression_strength: float = 0.75,
    ) -> Heightmap:
        subject_mask_result = _generate_subject_mask_result(
            image,
            blur_radius_px=mask_blur_radius_px,
        )
        subject_mask = subject_mask_result.mask
        portrait_regions = analyze_portrait_regions(image)
        geometry_image = prepare_geometry_analysis_image(
            image,
            subject_mask=subject_mask,
            portrait_regions=portrait_regions,
        )

        depth_result = _infer_depth_anything_v2_small_result(geometry_image)
        relative_depth = depth_result.depth
        depth = _normalize_depth(relative_depth)
        if depth.shape != subject_mask.shape:
            depth = _resize_unit_array(depth, subject_mask.shape)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        semantic_base = depth * (
            subject_boost * subject_mask + background_scale * (1.0 - subject_mask)
        )
        semantic_base = _normalize_unit_array(semantic_base)

        detail_unit = _deterministic_detail_unit(
            geometry_image,
            source=detail_source,
            contrast=contrast,
            gamma=gamma,
        )
        detail_layer = _extract_subject_detail_layer(
            detail_unit,
            radius=detail_radius_px,
            clip=detail_clip,
        )

        detail_weight_map = _portrait_detail_weight_map(
            detail_layer.shape,
            portrait_regions=portrait_regions,
        )

        blended = (
            semantic_base
            + detail_weight * subject_mask * detail_weight_map * detail_layer
        )
        blended = blended.clip(0.0, 1.0).astype(np.float32)

        relief_depth = _apply_bas_relief_transform(
            blended,
            compression_strength=compression_strength,
        )
        relief_depth = _apply_subject_surface_smoothing(
            relief_depth,
            subject_mask=subject_mask,
        )
        relief_depth = _apply_portrait_surface_smoothing(
            relief_depth,
            portrait_regions=portrait_regions,
        )
        relief_depth = _apply_portrait_face_pit_guard(
            relief_depth,
            portrait_regions=portrait_regions,
        )
        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)

        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
            provider_audit=_provider_audit_map(
                monocular_depth=depth_result.audit,
                subject_segmentation=subject_mask_result.audit,
            ),
            segmentation_status=_segmentation_status_to_dict(subject_mask_result),
            face_analysis_status=portrait_regions.to_metadata(),
            debug_artifacts=_hybrid_debug_artifacts(
                geometry_image=geometry_image,
                subject_mask=subject_mask,
                portrait_regions=portrait_regions,
                semantic_base=semantic_base,
                detail_layer=detail_layer,
                detail_weight_map=detail_weight_map,
                blended=blended,
                relief_depth=relief_depth,
            ),
        )


class TripoSRSidecarProvider:
    """Experiment 5: full 3D sidecar benchmark using Tripo AI API.

    Pipeline:
    1. Upload source image to Tripo AI API.
    2. Create an image_to_model task (Tripo's cloud-hosted 3D reconstruction).
    3. Poll until task completes, download the GLB result.
    4. Load GLB into trimesh, project front-face depth via orthographic raycasting.
    5. Apply tone curve, bas-relief compression, smoothing.
    6. Feed into standard heightmap -> STL/GLB pipeline.

    This provider evaluates whether full image-to-3D reconstruction produces
    useful depth inputs for 5x7 printable bas-relief, compared to monocular
    depth estimators like Depth Anything V2.

    Requires:
    - TRIPO_API_KEY environment variable
    - trimesh (pip install trimesh)
    """

    name = "triposr_sidecar"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
        contrast: float = 1.0,
        gamma: float = 1.0,
        post_smooth_radius_px: float = 0.8,
        compression_strength: float = 0.75,
    ) -> Heightmap:
        mesh_3d = _infer_triposr_api(image)

        # Compute target height in pixels from 5:7 aspect ratio
        target_width_px = 200
        target_height_px = int(target_width_px * 7 / 5)

        depth = _project_mesh_to_depth(mesh_3d, target_width_px, target_height_px)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Apply bas-relief gradient compression (same as experiment 3+)
        relief_depth = _apply_bas_relief_transform(
            depth, compression_strength=compression_strength
        )

        relief_depth = _smooth_unit_array(relief_depth, post_smooth_radius_px)
        heights = _depth_to_heights(
            relief_depth,
            base_thickness_mm=base_thickness_mm,
            min_relief_mm=min_relief_mm,
            max_relief_mm=max_relief_mm,
        )

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )


_TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"


def _get_tripo_api_key() -> str:
    """Read TRIPO_API_KEY from environment or .env files."""
    import os

    key = os.environ.get("TRIPO_API_KEY")
    if key:
        return key

    # Walk up from this file's directory looking for .env
    from pathlib import Path

    for env_dir in [
        Path(__file__).resolve().parents[1],          # services/print-file-generator
        Path(__file__).resolve().parents[3],          # project root
    ]:
        env_file = env_dir / ".env"
        if env_file.is_file():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("TRIPO_API_KEY="):
                    val = line.split("=", 1)[1].strip().strip("'\"")
                    if val:
                        return val

    raise RuntimeError(
        "triposr_sidecar requires TRIPO_API_KEY. "
        "Set it as an environment variable or in the project root .env file."
    )


def _tripo_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_get_tripo_api_key()}",
    }


def _infer_triposr_api(image: Image.Image) -> Any:
    """Call the Tripo AI REST API to reconstruct a 3D mesh from an image.

    Steps:
    1. Upload image via multipart POST to /upload.
    2. Create image_to_model task with the returned file_token.
    3. Poll task status until success.
    4. Download the GLB model from the output URL.
    5. Load into trimesh and return.
    """
    import io
    import time
    import requests

    try:
        import trimesh as _trimesh  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "triposr_sidecar requires 'trimesh'. "
            "Install it with: pip install trimesh"
        ) from exc

    api_key = _get_tripo_api_key()

    # --- Step 1: Upload image ---
    img_bytes = io.BytesIO()
    image.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    upload_resp = requests.post(
        f"{_TRIPO_API_BASE}/upload",
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": ("source.png", img_bytes, "image/png")},
        timeout=30,
    )
    upload_resp.raise_for_status()
    upload_data = upload_resp.json()

    if upload_data.get("code") != 0:
        raise RuntimeError(
            f"Tripo upload failed: {upload_data.get('message', 'unknown error')}"
        )

    image_token = upload_data["data"]["image_token"]

    # --- Step 2: Create image_to_model task ---
    task_payload = {
        "type": "image_to_model",
        "model_version": "v2.5-20250123",
        "file": {
            "type": "png",
            "file_token": image_token,
        },
        "texture": False,  # We only need geometry, saves credits
    }

    task_resp = requests.post(
        f"{_TRIPO_API_BASE}/task",
        headers=_tripo_headers(),
        json=task_payload,
        timeout=30,
    )
    task_resp.raise_for_status()
    task_data = task_resp.json()

    if task_data.get("code") != 0:
        raise RuntimeError(
            f"Tripo task creation failed: {task_data.get('message', 'unknown error')}"
        )

    task_id = task_data["data"]["task_id"]

    # --- Step 3: Poll until success ---
    max_polls = 120  # 4 minutes at 2s intervals
    for i in range(max_polls):
        time.sleep(2)

        poll_resp = requests.get(
            f"{_TRIPO_API_BASE}/task/{task_id}",
            headers=_tripo_headers(),
            timeout=30,
        )
        poll_resp.raise_for_status()
        poll_data = poll_resp.json()["data"]
        status = poll_data.get("status")

        if status == "success":
            break
        elif status in ("failed", "banned", "expired", "cancelled", "unknown"):
            raise RuntimeError(
                f"Tripo task {task_id} ended with status: {status}"
            )
        # else: queued or running — keep polling
    else:
        raise RuntimeError(
            f"Tripo task {task_id} timed out after {max_polls * 2}s"
        )

    # --- Step 4: Download GLB model ---
    output = poll_data.get("output", {})
    # Tripo returns different keys depending on task params:
    # base_model (geometry only), model (textured), pbr_model (PBR variant)
    model_url = (
        output.get("base_model")
        or output.get("model")
        or output.get("pbr_model")
    )
    if not model_url:
        raise RuntimeError(
            f"Tripo task {task_id} succeeded but no model URL in output: {output}"
        )

    model_resp = requests.get(model_url, timeout=60)
    model_resp.raise_for_status()

    # --- Step 5: Load into trimesh ---
    import trimesh

    glb_bytes = io.BytesIO(model_resp.content)
    scene = trimesh.load(glb_bytes, file_type="glb", force="scene")

    if isinstance(scene, trimesh.Trimesh):
        return scene

    # Extract first mesh from scene
    if hasattr(scene, "geometry") and scene.geometry:
        geometries = list(scene.geometry.values())
        if geometries:
            return geometries[0]

    raise RuntimeError(
        f"Tripo task {task_id} returned a GLB with no extractable mesh geometry"
    )


def _project_mesh_to_depth(
    mesh: Any, width_px: int, height_px: int
) -> np.ndarray:
    """Project a 3D mesh into a front-face depth map via orthographic raycasting.

    Uses trimesh's ray-mesh intersection (no OpenGL context needed) to cast
    rays in the -Z direction and record hit distances. This produces a
    unit-normalized depth array where closer surfaces are higher values
    (more relief).

    Args:
        mesh: A trimesh.Trimesh object.
        width_px: Output depth map width.
        height_px: Output depth map height.

    Returns:
        A float32 array of shape (height_px, width_px) in [0, 1].
    """
    import trimesh as _trimesh

    if not isinstance(mesh, _trimesh.Trimesh):
        # If we got a Scene or similar, try to extract the first mesh
        if hasattr(mesh, "geometry"):
            geometries = list(mesh.geometry.values())
            if geometries:
                mesh = geometries[0]
            else:
                raise RuntimeError("TripoSR scene contained no geometry")
        else:
            raise RuntimeError(
                f"Expected trimesh.Trimesh, got {type(mesh).__name__}"
            )

    # Center and normalize the mesh
    mesh_copy = mesh.copy()
    mesh_copy.vertices -= mesh_copy.bounds.mean(axis=0)
    scale = mesh_copy.extents.max()
    if scale > 1e-8:
        mesh_copy.vertices /= scale

    bounds = mesh_copy.bounds  # [[min_x, min_y, min_z], [max_x, max_y, max_z]]

    # Set up orthographic ray grid
    # Rays go in -Z direction, starting from above max_z
    x_coords = np.linspace(bounds[0, 0], bounds[1, 0], width_px)
    y_coords = np.linspace(bounds[1, 1], bounds[0, 1], height_px)  # flip Y for image coords
    xx, yy = np.meshgrid(x_coords, y_coords)
    xx = xx.ravel()
    yy = yy.ravel()

    z_start = bounds[1, 2] + 0.1  # slightly above the mesh
    origins = np.column_stack([xx, yy, np.full_like(xx, z_start)])
    directions = np.tile([0.0, 0.0, -1.0], (len(xx), 1))

    # Cast rays
    intersector = _trimesh.ray.ray_triangle.RayMeshIntersector(mesh_copy)
    hit_locations, ray_indices, _face_indices = intersector.intersects_location(
        origins, directions, multiple_hits=False
    )

    # Build depth map
    depth = np.zeros(width_px * height_px, dtype=np.float32)
    if len(ray_indices) > 0:
        hit_z = hit_locations[:, 2]
        depth[ray_indices] = hit_z

    depth = depth.reshape(height_px, width_px)

    # Normalize: closer to camera (higher z) = higher value (more relief)
    z_min = bounds[0, 2]
    z_max = bounds[1, 2]
    z_range = z_max - z_min
    if z_range > 1e-8:
        depth = ((depth - z_min) / z_range).clip(0.0, 1.0)
    else:
        depth = np.zeros_like(depth)

    # Zero out non-hit pixels (background)
    non_hit_mask = np.ones(width_px * height_px, dtype=bool)
    if len(ray_indices) > 0:
        non_hit_mask[ray_indices] = False
    depth.ravel()[non_hit_mask] = 0.0

    return depth.astype(np.float32)


def _generate_subject_mask(
    image: Image.Image,
    *,
    blur_radius_px: float = 5.0,
    full_image_threshold: float = 0.90,
) -> np.ndarray:
    """Soft subject mask via the configured segmentation provider chain.

    Thin shim over ``app.providers.SubjectSegmentationChain``. Adds the
    heightmap-specific post-processing (full-image fallback, Gaussian
    edge blur) on top of the provider's raw mask.

    Returns a float32 array in [0, 1] matching the image dimensions,
    where 1.0 = subject and 0.0 = background.
    """
    return _generate_subject_mask_result(
        image,
        blur_radius_px=blur_radius_px,
        full_image_threshold=full_image_threshold,
    ).mask


def _generate_subject_mask_result(
    image: Image.Image,
    *,
    blur_radius_px: float = 5.0,
    full_image_threshold: float = 0.90,
) -> SubjectMaskResult:
    chain = _get_segmentation_chain()
    result = chain.segment(image)

    raw_mask = result.mask

    w, h = image.size
    total_pixels = w * h
    mask_area = float(np.sum(raw_mask > 0.5))
    mask_coverage = mask_area / total_pixels if total_pixels > 0 else 0.0

    no_segments = not result.foreground_labels and not result.raw_segments
    status: Literal["ok", "empty_mask", "full_image_mask", "api_failure"] = "ok"
    if no_segments or mask_area == 0:
        raise ValueError(
            "Subject segmentation returned no usable foreground mask for "
            "masked_depth_detail_blend."
        )

    if mask_coverage > full_image_threshold:
        status = "full_image_mask"
        return SubjectMaskResult(
            mask=np.ones((h, w), dtype=np.float32),
            status=status,
            audit=result.audit,
            mask_coverage=mask_coverage,
            foreground_labels=result.foreground_labels,
            raw_segment_count=len(result.raw_segments),
        )

    if blur_radius_px > 0:
        return SubjectMaskResult(
            mask=_smooth_subject_mask_contour(
                raw_mask,
                feather_radius_px=blur_radius_px,
            ),
            status=status,
            audit=result.audit,
            mask_coverage=mask_coverage,
            foreground_labels=result.foreground_labels,
            raw_segment_count=len(result.raw_segments),
        )

    return SubjectMaskResult(
        mask=raw_mask.clip(0.0, 1.0).astype(np.float32),
        status=status,
        audit=result.audit,
        mask_coverage=mask_coverage,
        foreground_labels=result.foreground_labels,
        raw_segment_count=len(result.raw_segments),
    )


def _deterministic_detail_unit(
    image: Image.Image,
    *,
    source: Literal["lithophane_baseline", "posterized_luminance"],
    contrast: float,
    gamma: float,
) -> np.ndarray:
    """Generate a unit detail reference from deterministic providers."""
    provider: Any
    if source == "lithophane_baseline":
        provider = LithophaneBaselineDepthProvider()
    elif source == "posterized_luminance":
        provider = LuminanceDepthProvider()
    else:
        raise ValueError(f"Unsupported detail source: {source}")

    detail_heightmap = provider.generate(
        image,
        base_thickness_mm=0.0,
        min_relief_mm=0.0,
        max_relief_mm=1.0,
        contrast=contrast,
        gamma=gamma,
        post_smooth_radius_px=0.0,
    )
    return _normalize_unit_array(detail_heightmap.values)


def _provider_audit_map(**audits: ProviderAudit | None) -> dict[str, dict[str, object]]:
    return {
        role: audit.to_dict()
        for role, audit in audits.items()
        if audit is not None
    }


def _segmentation_status_to_dict(result: SubjectMaskResult) -> dict[str, object]:
    return {
        "status": result.status,
        "mask_coverage": result.mask_coverage,
        "foreground_labels": list(result.foreground_labels),
        "raw_segment_count": result.raw_segment_count,
    }


def _smooth_subject_mask_contour(
    raw_mask: np.ndarray,
    *,
    feather_radius_px: float,
) -> np.ndarray:
    """Smooth blocky segmentation contours and return a feathered subject mask."""
    mask = raw_mask.astype(np.float32).clip(0.0, 1.0)
    if mask.size == 0:
        return mask

    binary = mask > 0.5
    if np.all(binary):
        return np.ones(mask.shape, dtype=np.float32)
    if not np.any(binary):
        return np.zeros(mask.shape, dtype=np.float32)

    try:
        import cv2

        radius = max(1, min(9, int(round(feather_radius_px * 0.45))))
        kernel_size = radius * 2 + 1
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (kernel_size, kernel_size),
        )
        binary_u8 = (binary.astype(np.uint8) * 255)
        closed = cv2.morphologyEx(binary_u8, cv2.MORPH_CLOSE, kernel)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel)
        inside = cv2.distanceTransform(opened, cv2.DIST_L2, 3)
        outside = cv2.distanceTransform(255 - opened, cv2.DIST_L2, 3)
        signed_distance = inside - outside
        feather = max(1.0, float(feather_radius_px))
        soft = ((signed_distance + feather) / (2.0 * feather)).clip(0.0, 1.0)
        return _smoothstep_array(soft).astype(np.float32)
    except Exception:
        mask_img = Image.fromarray((mask * 255).round().astype(np.uint8), mode="L")
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=feather_radius_px))
        return (np.asarray(mask_img, dtype=np.float32) / 255.0).clip(0.0, 1.0)


def prepare_geometry_analysis_image(
    image: Image.Image,
    *,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks | None = None,
) -> Image.Image:
    """Build a geometry-only image that suppresses proof halos and texture noise."""
    rgb_image = image.convert("RGB")
    width, height = rgb_image.size
    mask = subject_mask.astype(np.float32).clip(0.0, 1.0)
    if mask.shape != (height, width):
        mask = _resize_unit_array(mask, (height, width))

    rgb = np.asarray(rgb_image, dtype=np.float32) / 255.0
    local_smooth = np.asarray(
        rgb_image.filter(ImageFilter.GaussianBlur(radius=1.35)),
        dtype=np.float32,
    ) / 255.0
    broad_radius = max(6.0, min(width, height) * 0.035)
    broad_smooth = np.asarray(
        rgb_image.filter(ImageFilter.GaussianBlur(radius=broad_radius)),
        dtype=np.float32,
    ) / 255.0

    background_pixels = rgb[mask < 0.08]
    if background_pixels.size:
        background_color = np.median(background_pixels, axis=0)
    else:
        background_color = np.median(rgb.reshape(-1, 3), axis=0)
    background_flat = 0.72 * background_color.reshape(1, 1, 3) + 0.28 * broad_smooth

    face_preserve = np.zeros((height, width), dtype=np.float32)
    if portrait_regions is not None and portrait_regions.face_oval.shape == mask.shape:
        face_preserve = np.maximum(face_preserve, 0.55 * portrait_regions.face_oval)
        face_preserve = np.maximum(face_preserve, 0.72 * portrait_regions.central_face)
        face_preserve = np.maximum(face_preserve, 0.90 * portrait_regions.eyes)
        face_preserve = np.maximum(face_preserve, 0.72 * portrait_regions.nose)
        face_preserve = np.maximum(face_preserve, 0.90 * portrait_regions.mouth)
        face_preserve = face_preserve.clip(0.0, 0.92)

    subject_keep = 0.52 + 0.42 * face_preserve
    subject_clean = rgb * subject_keep[..., None] + local_smooth * (
        1.0 - subject_keep[..., None]
    )

    boundary = _smooth_unit_array(_normalized_gradient_magnitude(mask), 1.6)
    boundary = boundary.clip(0.0, 0.85)
    composed = background_flat * (1.0 - mask[..., None]) + subject_clean * mask[..., None]
    composed = composed * (1.0 - boundary[..., None]) + local_smooth * boundary[..., None]

    return Image.fromarray((composed * 255.0).round().clip(0, 255).astype(np.uint8))


def _hybrid_debug_artifacts(
    *,
    geometry_image: Image.Image,
    subject_mask: np.ndarray,
    portrait_regions: PortraitRegionMasks,
    semantic_base: np.ndarray,
    detail_layer: np.ndarray,
    detail_weight_map: np.ndarray,
    blended: np.ndarray,
    relief_depth: np.ndarray,
) -> dict[str, bytes]:
    from .image_pipeline import image_to_png_bytes

    return {
        "geometry-input.png": image_to_png_bytes(geometry_image.convert("RGB")),
        "subject-mask.png": _debug_unit_array_png_bytes(subject_mask),
        "portrait-face-oval-mask.png": _debug_unit_array_png_bytes(
            portrait_regions.face_oval
        ),
        "portrait-central-face-mask.png": _debug_unit_array_png_bytes(
            portrait_regions.central_face
        ),
        "portrait-nose-mask.png": _debug_unit_array_png_bytes(portrait_regions.nose),
        "portrait-detail-weight-map.png": _debug_unit_array_png_bytes(
            detail_weight_map
        ),
        "semantic-base.png": _debug_unit_array_png_bytes(semantic_base),
        "detail-layer.png": _debug_signed_array_png_bytes(detail_layer),
        "blended-depth.png": _debug_unit_array_png_bytes(blended),
        "relief-depth.png": _debug_unit_array_png_bytes(relief_depth),
    }


def resize_heightmap_to_shape(
    heightmap: Heightmap,
    *,
    target_shape: tuple[int, int],
) -> Heightmap:
    target_rows, target_cols = target_shape
    if heightmap.values.shape == target_shape:
        return heightmap
    if target_rows < 2 or target_cols < 2:
        raise ValueError("Target heightmap shape must be at least 2x2")

    resized = _resize_float_array(heightmap.values, target_shape)
    resized = resized.clip(heightmap.min_height_mm, heightmap.max_height_mm)
    return Heightmap(
        values=resized.astype(np.float32),
        min_height_mm=float(np.min(resized)),
        max_height_mm=float(np.max(resized)),
        provider=heightmap.provider,
        provider_audit=heightmap.provider_audit,
        segmentation_status=heightmap.segmentation_status,
        face_analysis_status=heightmap.face_analysis_status,
        debug_artifacts=heightmap.debug_artifacts,
    )


def _extract_subject_detail_layer(
    detail_unit: np.ndarray,
    *,
    radius: int,
    clip: float,
) -> np.ndarray:
    """High-frequency deterministic detail in [-1, 1] for masked blending."""
    if detail_unit.size == 0:
        return detail_unit.astype(np.float32)

    base = _guided_filter_self(
        detail_unit.astype(np.float32),
        radius=max(1, int(radius)),
        eps=0.02,
    )
    high_frequency = detail_unit.astype(np.float32) - base
    if clip <= 0:
        return high_frequency.astype(np.float32)

    return (np.clip(high_frequency, -clip, clip) / clip).astype(np.float32)


def _portrait_detail_weight_map(
    shape: tuple[int, int],
    *,
    portrait_regions: PortraitRegionMasks,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return np.ones(shape, dtype=np.float32)
    if portrait_regions.central_face.shape != shape:
        return np.ones(shape, dtype=np.float32)

    feature_mask = np.maximum.reduce(
        (
            portrait_regions.eyes,
            portrait_regions.nose,
            portrait_regions.mouth,
        )
    )
    central_skin = np.clip(
        portrait_regions.central_face
        - feature_mask,
        0.0,
        1.0,
    )
    outer_face_skin = np.clip(
        portrait_regions.face_oval - portrait_regions.central_face - feature_mask,
        0.0,
        1.0,
    )
    damping = (
        0.62 * central_skin
        + 0.56 * outer_face_skin
        + 0.78 * portrait_regions.eyes
        + 0.52 * portrait_regions.nose
        + 0.72 * portrait_regions.mouth
    )
    return (1.0 - damping).clip(0.12, 1.0).astype(np.float32)


def _apply_portrait_surface_smoothing(
    relief_depth: np.ndarray,
    *,
    portrait_regions: PortraitRegionMasks,
    radius_px: float = 3.4,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return relief_depth.astype(np.float32)
    if portrait_regions.face_oval.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    smoothed = _smooth_unit_array(relief_depth, radius_px)
    face_mask = np.maximum(
        0.74 * portrait_regions.face_oval,
        0.82 * portrait_regions.central_face,
    )
    face_mask = np.maximum(face_mask, 0.88 * portrait_regions.eyes)
    face_mask = np.maximum(face_mask, 0.72 * portrait_regions.nose)
    face_mask = np.maximum(face_mask, 0.84 * portrait_regions.mouth)
    face_mask = face_mask.clip(0.0, 0.90).astype(np.float32)

    return (
        relief_depth.astype(np.float32) * (1.0 - face_mask)
        + smoothed.astype(np.float32) * face_mask
    ).clip(0.0, 1.0).astype(np.float32)


def _apply_portrait_face_pit_guard(
    relief_depth: np.ndarray,
    *,
    portrait_regions: PortraitRegionMasks,
    radius_px: float = 7.5,
    max_drop: float = 0.035,
    strength: float = 0.92,
) -> np.ndarray:
    if portrait_regions.face_count == 0:
        return relief_depth.astype(np.float32)
    if portrait_regions.face_oval.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    face_mask = np.maximum(
        0.78 * portrait_regions.face_oval,
        0.86 * portrait_regions.central_face,
    )
    feature_preserve = np.maximum(0.92 * portrait_regions.eyes, 0.72 * portrait_regions.mouth)
    face_mask = (face_mask * (1.0 - feature_preserve)).clip(0.0, 0.86)
    if float(np.max(face_mask)) <= 0.0:
        return relief_depth.astype(np.float32)

    broad_face = _smooth_unit_array(relief_depth, radius_px)
    guarded = np.maximum(
        relief_depth.astype(np.float32),
        broad_face - float(np.clip(max_drop, 0.0, 1.0)),
    ).clip(0.0, 1.0)
    blend = (face_mask * float(np.clip(strength, 0.0, 1.0))).clip(0.0, 0.86)
    return (
        relief_depth.astype(np.float32) * (1.0 - blend)
        + guarded.astype(np.float32) * blend
    ).clip(0.0, 1.0).astype(np.float32)


def _apply_subject_surface_smoothing(
    relief_depth: np.ndarray,
    *,
    subject_mask: np.ndarray,
    radius_px: float = 2.3,
    strength: float = 0.55,
) -> np.ndarray:
    if relief_depth.size == 0 or subject_mask.shape != relief_depth.shape:
        return relief_depth.astype(np.float32)

    smoothed = _smooth_unit_array(relief_depth, radius_px)
    structural_base = _guided_filter_self(
        relief_depth.astype(np.float32),
        radius=5,
        eps=0.025,
    )
    structural_edges = _normalized_gradient_magnitude(structural_base)
    edge_protection = _smoothstep_array(
        ((structural_edges - 0.22) / 0.45).clip(0.0, 1.0)
    )
    smoothing_mask = (
        subject_mask.astype(np.float32).clip(0.0, 1.0)
        * float(np.clip(strength, 0.0, 1.0))
        * (1.0 - edge_protection)
    )

    return (
        relief_depth.astype(np.float32) * (1.0 - smoothing_mask)
        + smoothed.astype(np.float32) * smoothing_mask
    ).clip(0.0, 1.0).astype(np.float32)


def apply_image_window_edge_fade(
    heightmap: Heightmap,
    *,
    fade_width_px: int | None = None,
) -> Heightmap:
    values = heightmap.values.astype(np.float32)
    if values.size == 0:
        return heightmap

    rows, cols = values.shape
    if rows < 3 or cols < 3:
        return heightmap

    width = fade_width_px
    if width is None:
        width = max(2, min(14, round(min(rows, cols) * 0.045)))
    width = int(width)
    if width <= 0:
        return heightmap

    edge_mask = _image_window_edge_mask(rows=rows, cols=cols, fade_width_px=width)
    floor = float(heightmap.min_height_mm)
    faded = floor + (values - floor) * edge_mask
    return Heightmap(
        values=faded.astype(np.float32),
        min_height_mm=float(np.min(faded)),
        max_height_mm=float(np.max(faded)),
        provider=heightmap.provider,
        provider_audit=heightmap.provider_audit,
        segmentation_status=heightmap.segmentation_status,
        face_analysis_status=heightmap.face_analysis_status,
        debug_artifacts=heightmap.debug_artifacts,
    )


def _image_window_edge_mask(*, rows: int, cols: int, fade_width_px: int) -> np.ndarray:
    y_distance = np.minimum(np.arange(rows), np.arange(rows)[::-1])
    x_distance = np.minimum(np.arange(cols), np.arange(cols)[::-1])
    edge_distance = np.minimum(y_distance[:, None], x_distance[None, :]).astype(
        np.float32
    )
    progress = (edge_distance / max(float(fade_width_px), 1.0)).clip(0.0, 1.0)
    return _smoothstep_array(progress).astype(np.float32)


def _normalized_gradient_magnitude(values: np.ndarray) -> np.ndarray:
    gradient_y, gradient_x = np.gradient(values.astype(np.float32))
    magnitude = np.sqrt(gradient_x * gradient_x + gradient_y * gradient_y)
    finite = magnitude[np.isfinite(magnitude)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)

    scale = float(np.percentile(finite, 96.0))
    if scale <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return (magnitude / scale).clip(0.0, 1.0).astype(np.float32)


def _smoothstep_array(values: np.ndarray) -> np.ndarray:
    return values * values * (3.0 - 2.0 * values)


@lru_cache(maxsize=1)
def _get_segmentation_chain() -> Any:
    from .providers import create_default_segmentation_chain

    return create_default_segmentation_chain()


def _box_filter(arr: np.ndarray, radius: int) -> np.ndarray:
    """Mean of a (2*radius+1)x(2*radius+1) box, edge-padded.

    Implemented via a summed-area table for O(N) cost regardless of radius.
    """
    if radius < 1:
        return arr.astype(np.float32)

    h, w = arr.shape
    padded = np.pad(arr.astype(np.float64), radius, mode="edge")
    sat = np.zeros((padded.shape[0] + 1, padded.shape[1] + 1), dtype=np.float64)
    sat[1:, 1:] = np.cumsum(np.cumsum(padded, axis=0), axis=1)

    size = 2 * radius + 1
    box_sum = (
        sat[size : size + h, size : size + w]
        - sat[0:h, size : size + w]
        - sat[size : size + h, 0:w]
        + sat[0:h, 0:w]
    )
    return (box_sum / (size * size)).astype(np.float32)


def _guided_filter_self(
    depth: np.ndarray, *, radius: int = 15, eps: float = 0.01
) -> np.ndarray:
    """Self-guided edge-preserving smoothing (He, Sun, Tang 2010).

    Returns the base layer for detail/base separation: a smoothed version
    of ``depth`` that preserves strong edges while flattening locally.
    """
    d = depth.astype(np.float32)

    mean = _box_filter(d, radius)
    mean_sq = _box_filter(d * d, radius)
    var = mean_sq - mean * mean

    a = var / (var + eps)
    b = mean - a * mean

    mean_a = _box_filter(a, radius)
    mean_b = _box_filter(b, radius)

    return (mean_a * d + mean_b).astype(np.float32)


def _apply_bas_relief_transform(
    depth: np.ndarray,
    compression_strength: float = 0.75,
    *,
    radius: int = 15,
    eps: float = 0.01,
    detail_boost: float = 1.5,
) -> np.ndarray:
    """Bas-relief compression via guided-filter detail/base separation.

    The depth is decomposed into a low-frequency *base* (global shape)
    and a high-frequency *detail* layer. The base is compressed into a
    target range; detail is preserved or amplified. Together they form
    a relief that fits a shallow printable Z range while keeping local
    feature definition. Maps Durand & Dorsey 2002 HDR tone mapping onto
    depth in place of log luminance.

    Replaces the previous gradient-attenuation transform, which was
    structurally a no-op for almost every pixel (compression_factor was
    dominated by silhouette-edge gradients and stayed near 1.0
    everywhere else).

    Args:
        depth: Unit-normalized [0, 1] depth array.
        compression_strength: How aggressively to compress global range.
            Higher = flatter base. Mapped to ``base_target_range =
            clip(1.0 - compression_strength, 0.1, 1.0)``. Default 0.75
            yields a base spanning 0.25 of the [0, 1] range.
        radius: Guided filter window radius in pixels. Roughly the
            scale at which features count as "detail" vs. "base".
        eps: Guided filter regularization. Larger = smoother base, more
            edge bleed. 0.01 is a reasonable default for depth in [0, 1].
        detail_boost: Multiplier on the detail layer. 1.0 preserves;
            >1.0 amplifies local features.

    Returns:
        Relief depth in [0, 1].
    """
    if depth.size == 0:
        return depth

    target_range = float(np.clip(1.0 - compression_strength, 0.1, 1.0))

    base = _guided_filter_self(depth.astype(np.float32), radius=radius, eps=eps)
    detail = depth.astype(np.float32) - base

    base_min = float(np.min(base))
    base_max = float(np.max(base))
    base_span = max(base_max - base_min, 1e-6)
    base_unit = (base - base_min) / base_span
    base_compressed = base_unit * target_range + (1.0 - target_range) / 2.0

    relief = base_compressed + detail_boost * detail
    return relief.clip(0.0, 1.0).astype(np.float32)


def get_depth_provider(name: HeightmapProviderName) -> Any:
    providers = {
        "posterized_luminance": LuminanceDepthProvider,
        "continuous_luminance": ContinuousLuminanceDepthProvider,
        "lithophane_baseline": LithophaneBaselineDepthProvider,
        "depth_anything_v2_small": DepthAnythingV2SmallDepthProvider,
        "depth_anything_v2_small_bas_relief": DepthAnythingV2SmallBasReliefProvider,
        "segformer_masked_depth": SegformerMaskedDepthProvider,
        "masked_depth_detail_blend": MaskedDepthDetailBlendProvider,
        "triposr_sidecar": TripoSRSidecarProvider,
    }
    return providers[name]()


def _image_to_unit_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image, dtype=np.float32) / 255.0


def heightmap_to_image_bytes(
    heightmap: Heightmap,
    *,
    bit_depth: Literal[8, 16] = 8,
) -> bytes:
    from .image_pipeline import image_to_png_bytes

    values = heightmap.values
    height_range = heightmap.max_height_mm - heightmap.min_height_mm
    if height_range <= 0:
        normalized_unit = np.zeros(values.shape, dtype=np.float32)
    else:
        normalized_unit = ((values - heightmap.min_height_mm) / height_range).clip(
            0.0,
            1.0,
        )

    if bit_depth == 16:
        normalized = (normalized_unit * 65535.0).round().astype(np.uint16)
        return image_to_png_bytes(Image.fromarray(normalized))

    normalized = (normalized_unit * 255.0).round().astype(np.uint8)
    return image_to_png_bytes(Image.fromarray(normalized))


def _debug_unit_array_png_bytes(values: np.ndarray) -> bytes:
    from .image_pipeline import image_to_png_bytes

    unit = values.astype(np.float32)
    if unit.size == 0:
        unit = np.zeros((1, 1), dtype=np.float32)
    unit = unit.clip(0.0, 1.0)
    return image_to_png_bytes(
        Image.fromarray((unit * 255.0).round().astype(np.uint8), mode="L")
    )


def _debug_signed_array_png_bytes(values: np.ndarray) -> bytes:
    unit = (values.astype(np.float32).clip(-1.0, 1.0) + 1.0) * 0.5
    return _debug_unit_array_png_bytes(unit)


def _apply_tone_curve(values: np.ndarray, *, contrast: float, gamma: float) -> np.ndarray:
    contrasted = ((values - 0.5) * contrast + 0.5).clip(0.0, 1.0)
    return np.power(contrasted, gamma).clip(0.0, 1.0)


def _normalized_edge_detail(grayscale: Image.Image) -> np.ndarray:
    edge_detail = _image_to_unit_array(
        grayscale.filter(ImageFilter.FIND_EDGES).filter(
            ImageFilter.GaussianBlur(radius=EDGE_SMOOTH_RADIUS_PX)
        )
    )
    return edge_detail / max(float(np.max(edge_detail)), 1e-6)


def _smooth_unit_array(values: np.ndarray, radius_px: float) -> np.ndarray:
    if radius_px <= 0:
        return values.clip(0.0, 1.0)

    kernel = _gaussian_kernel(radius_px)
    padding = len(kernel) // 2
    padded_x = np.pad(
        values.astype(np.float32),
        ((0, 0), (padding, padding)),
        mode="edge",
    )
    smoothed_x = np.apply_along_axis(
        lambda row: np.convolve(row, kernel, mode="valid"),
        axis=1,
        arr=padded_x,
    )
    padded_y = np.pad(smoothed_x, ((padding, padding), (0, 0)), mode="edge")
    smoothed = np.apply_along_axis(
        lambda column: np.convolve(column, kernel, mode="valid"),
        axis=0,
        arr=padded_y,
    )
    return smoothed.astype(np.float32).clip(0.0, 1.0)


def _resize_float_array(values: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    target_rows, target_cols = target_shape
    if values.shape == target_shape:
        return values.astype(np.float32)

    resampling = getattr(Image, "Resampling", Image).BICUBIC
    image = Image.fromarray(values.astype(np.float32), mode="F")
    resized = image.resize((target_cols, target_rows), resampling)
    return np.asarray(resized, dtype=np.float32)


def _resize_unit_array(values: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    resized = _resize_float_array(values.astype(np.float32), target_shape)
    return resized.clip(0.0, 1.0).astype(np.float32)


def _normalize_depth(values: np.ndarray) -> np.ndarray:
    finite_values = values[np.isfinite(values)]
    if finite_values.size == 0:
        raise ValueError("Depth Anything returned no finite depth values")

    low, high = np.percentile(finite_values, [2.0, 98.0])
    if high - low <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return ((values.astype(np.float32) - low) / (high - low)).clip(0.0, 1.0)


def _normalize_unit_array(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values.astype(np.float32)

    finite_values = values[np.isfinite(values)]
    if finite_values.size == 0:
        return np.zeros(values.shape, dtype=np.float32)

    low = float(np.min(finite_values))
    high = float(np.max(finite_values))
    if high - low <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return ((values.astype(np.float32) - low) / (high - low)).clip(0.0, 1.0)


def _infer_depth_anything_v2_small(image: Image.Image) -> np.ndarray:
    """Depth array via the configured monocular-depth provider chain.

    Thin shim over ``app.providers.MonocularDepthChain``.
    """
    return _infer_depth_anything_v2_small_result(image).depth


def _infer_depth_anything_v2_small_result(image: Image.Image) -> DepthInferenceResult:
    """Depth array and provider audit via the configured provider chain."""
    chain = _get_depth_chain()
    result = chain.infer_depth(image)
    return DepthInferenceResult(depth=result.depth, audit=result.audit)


@lru_cache(maxsize=1)
def _get_depth_chain() -> Any:
    from .providers import create_default_depth_chain

    return create_default_depth_chain()


def _gaussian_kernel(radius_px: float) -> np.ndarray:
    half_width = max(1, int(np.ceil(radius_px * 3.0)))
    offsets = np.arange(-half_width, half_width + 1, dtype=np.float32)
    kernel = np.exp(-(offsets * offsets) / (2.0 * radius_px * radius_px))
    return kernel / np.sum(kernel)


def _depth_to_heights(
    printable_depth: np.ndarray,
    *,
    base_thickness_mm: float,
    min_relief_mm: float,
    max_relief_mm: float,
) -> np.ndarray:
    relief = min_relief_mm + printable_depth * (max_relief_mm - min_relief_mm)
    return base_thickness_mm + relief
