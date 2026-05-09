from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageFilter, ImageOps


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
    "sam_masked_depth",
    "triposr_sidecar",
]


@dataclass(frozen=True)
class Heightmap:
    values: np.ndarray
    min_height_mm: float
    max_height_mm: float
    provider: str


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
        relative_depth = _infer_depth_anything_v2_small(image)
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
        relative_depth = _infer_depth_anything_v2_small(image)
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
        )


class SamMaskedDepthProvider:
    """Experiment 4: combine Depth Anything V2 Small with SAM subject masks.

    Pipeline:
    1. Run Depth Anything V2 Small for semantic depth.
    2. Run SAM automatic mask generation for subject segmentation.
    3. Select the largest non-full-image mask as the subject.
    4. Soft-blur the mask edges to avoid harsh cutout ridges.
    5. Boost subject depth, suppress background depth.
    6. Apply bas-relief gradient compression.
    """

    name = "sam_masked_depth"

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
        relative_depth = _infer_depth_anything_v2_small(image)
        depth = _normalize_depth(relative_depth)
        depth = _apply_tone_curve(depth, contrast=contrast, gamma=gamma)

        # Subject mask
        subject_mask = _generate_subject_mask(image, blur_radius_px=mask_blur_radius_px)

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
    """Generate a soft subject mask using the HF Inference API for segmentation.

    Calls nvidia/segformer-b0-finetuned-ade-512-512 via the Hugging Face
    Inference API.  The model returns labelled segments (e.g. "person",
    "wall", "floor").  All foreground-labelled masks are merged into a
    single subject mask, then Gaussian-blurred for soft edges.

    Returns a float32 array in [0, 1] matching the image dimensions,
    where 1.0 = subject and 0.0 = background.
    """
    segments = _infer_segmentation_api(image)

    w, h = image.size

    if not segments:
        return np.ones((h, w), dtype=np.float32)

    # Background label set — everything NOT in this set is treated as subject
    background_labels = {
        "wall", "ceiling", "floor", "sky", "earth", "grass", "road",
        "sidewalk", "pavement", "building", "fence", "sea", "water",
        "mountain", "tree", "plant", "field", "sand",
    }

    combined_mask = np.zeros((h, w), dtype=np.float32)
    for seg in segments:
        label = seg.get("label", "").lower()
        mask_b64 = seg.get("mask")
        if mask_b64 is None:
            continue
        if label in background_labels:
            continue  # Skip background segments

        mask_img = _decode_base64_mask(mask_b64)
        if mask_img.size != (w, h):
            mask_img = mask_img.resize((w, h), Image.BILINEAR)
        mask_arr = np.asarray(mask_img.convert("L"), dtype=np.float32) / 255.0
        combined_mask = np.maximum(combined_mask, mask_arr)

    total_pixels = w * h
    mask_area = float(np.sum(combined_mask > 0.5))

    if mask_area / total_pixels > full_image_threshold or mask_area == 0:
        # Mask covers almost everything or nothing — fallback to all-subject
        return np.ones((h, w), dtype=np.float32)

    # Soft-blur edges
    if blur_radius_px > 0:
        mask_img = Image.fromarray(
            (combined_mask * 255).clip(0, 255).astype(np.uint8), mode="L"
        )
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=blur_radius_px))
        combined_mask = np.asarray(mask_img, dtype=np.float32) / 255.0

    return combined_mask.clip(0.0, 1.0).astype(np.float32)


def _infer_segmentation_api(image: Image.Image) -> list[dict[str, Any]]:
    """Call the HF Inference API for image segmentation.

    Returns a list of dicts, each with 'label', 'score', and 'mask'
    (base64-encoded PNG string).
    """
    import io as _io
    import os

    try:
        import requests
    except ImportError as exc:
        raise RuntimeError(
            "sam_masked_depth requires the 'requests' package for HF Inference API calls."
        ) from exc

    token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
    if not token:
        # Try loading from the project root .env
        try:
            from dotenv import load_dotenv

            _root_env = os.path.join(
                os.path.dirname(__file__), os.pardir, os.pardir, os.pardir, os.pardir, ".env"
            )
            load_dotenv(os.path.normpath(_root_env))
            token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
        except ImportError:
            pass

    if not token:
        raise RuntimeError(
            "sam_masked_depth requires a Hugging Face API key. "
            "Set HUGGINGFACE_API_KEY or HF_TOKEN in the environment or root .env file."
        )

    buf = _io.BytesIO()
    image.save(buf, format="PNG")
    image_bytes = buf.getvalue()

    url = (
        "https://router.huggingface.co/hf-inference/models/"
        "nvidia/segformer-b0-finetuned-ade-512-512"
    )
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "image/png"}

    resp = requests.post(url, headers=headers, data=image_bytes, timeout=120)

    if resp.status_code != 200:
        raise RuntimeError(
            f"HF Inference API returned {resp.status_code}: {resp.text[:300]}"
        )

    return resp.json()


def _decode_base64_mask(mask_b64: str) -> Image.Image:
    """Decode a base64-encoded PNG mask string to a PIL Image."""
    import base64
    import io as _io

    mask_bytes = base64.b64decode(mask_b64)
    return Image.open(_io.BytesIO(mask_bytes)).convert("L")


def _apply_bas_relief_transform(
    depth: np.ndarray, compression_strength: float = 0.75
) -> np.ndarray:
    """
    Apply gradient compression to convert a depth map into a bas-relief map.

    Bas-relief compression reduces steep gradients while preserving local detail,
    allowing readable features to fit in shallow relief (0.4-3.0 mm).
    Based on "Digital Bas-Relief from 3D Scenes" techniques.

    Args:
        depth: Unit-normalized depth array (0.0-1.0)
        compression_strength: How aggressively to compress gradients (0.0-1.0)
                             Higher = more compression, flatter overall depth

    Returns:
        Compressed depth array suitable for relief mapping
    """
    if depth.size == 0:
        return depth

    # Compute gradients (approximates slope)
    grad_y, grad_x = np.gradient(depth)
    gradient_magnitude = np.sqrt(grad_x**2 + grad_y**2).astype(np.float32)

    # Normalize gradients for compression ratio
    grad_max = float(np.max(gradient_magnitude))
    if grad_max > 1e-6:
        normalized_gradient = gradient_magnitude / grad_max
    else:
        normalized_gradient = np.zeros_like(gradient_magnitude)

    # Compute compression factor based on gradient magnitude
    # Steep regions (high gradient) get compressed more
    compression_factor = 1.0 - (normalized_gradient * compression_strength).clip(0.0, 1.0)

    # Apply compression: reduce the depth variation in high-gradient regions
    # while preserving mid-tone local detail
    relief = depth.copy().astype(np.float32)
    relief = (relief - 0.5) * compression_factor + 0.5
    relief = relief.clip(0.0, 1.0).astype(np.float32)

    return relief


def get_depth_provider(name: HeightmapProviderName) -> Any:
    providers = {
        "posterized_luminance": LuminanceDepthProvider,
        "continuous_luminance": ContinuousLuminanceDepthProvider,
        "lithophane_baseline": LithophaneBaselineDepthProvider,
        "depth_anything_v2_small": DepthAnythingV2SmallDepthProvider,
        "depth_anything_v2_small_bas_relief": DepthAnythingV2SmallBasReliefProvider,
        "sam_masked_depth": SamMaskedDepthProvider,
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


def _normalize_depth(values: np.ndarray) -> np.ndarray:
    finite_values = values[np.isfinite(values)]
    if finite_values.size == 0:
        raise ValueError("Depth Anything returned no finite depth values")

    low, high = np.percentile(finite_values, [2.0, 98.0])
    if high - low <= 1e-6:
        return np.zeros(values.shape, dtype=np.float32)

    return ((values.astype(np.float32) - low) / (high - low)).clip(0.0, 1.0)


def _infer_depth_anything_v2_small(image: Image.Image) -> np.ndarray:
    pipe = _depth_anything_v2_small_pipeline()
    output = pipe(image)

    predicted_depth = output.get("predicted_depth")
    if predicted_depth is not None:
        if hasattr(predicted_depth, "detach"):
            predicted_depth = predicted_depth.detach().cpu().numpy()
        depth = np.asarray(predicted_depth, dtype=np.float32)
        return np.squeeze(depth)

    depth_image = output.get("depth")
    if depth_image is not None:
        return _image_to_unit_array(depth_image.convert("L"))

    raise RuntimeError("Depth Anything output did not include a depth map")


@lru_cache(maxsize=1)
def _depth_anything_v2_small_pipeline() -> Any:
    try:
        import torch
        from transformers import pipeline
    except ImportError as exc:
        raise RuntimeError(
            "depth_anything_v2_small requires the experiment ML dependencies: "
            "install torch and transformers, or run another height provider."
        ) from exc

    device = 0 if torch.cuda.is_available() else -1
    return pipeline(
        task="depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=device,
    )


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
