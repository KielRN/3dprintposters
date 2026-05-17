from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image

from ..depth_filters import (
    _apply_bas_relief_transform,
    _apply_tone_curve,
    _depth_to_heights,
    _smooth_unit_array,
)
from ..depth_types import Heightmap


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
