"""Quality gate metrics for heightmap providers.

Pure functions that take heightmap data + canonical inputs (subject mask,
source image) and return per-metric scalar values. Metric definitions and
proposed thresholds come from
research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md, item 3.

Initial release is calibration-only: metrics are computed and reported,
no pass/fail thresholds asserted yet. Once the existing five experiments
have been measured, the resulting numbers are used to lock thresholds
and v2 will flip the harness into gating mode.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter


@dataclass
class HeightmapBundle:
    heightmap_mm: np.ndarray
    min_height_mm: float
    max_height_mm: float
    height_px: int
    width_px: int
    metadata: dict[str, Any]


def load_heightmap_bundle(heightmap_path: Path, metadata_path: Path) -> HeightmapBundle:
    img = Image.open(heightmap_path)
    arr = np.asarray(img)

    if img.mode == "I;16" or arr.dtype == np.uint16:
        unit = arr.astype(np.float32) / 65535.0
    elif img.mode in {"L", "P"} or arr.dtype == np.uint8:
        unit = arr.astype(np.float32) / 255.0
    else:
        raise ValueError(f"Unexpected heightmap mode={img.mode}, dtype={arr.dtype}")

    metadata = json.loads(metadata_path.read_text())
    min_mm = float(metadata["min_height_mm"])
    max_mm = float(metadata["max_height_mm"])
    heightmap_mm = (min_mm + unit * (max_mm - min_mm)).astype(np.float32)

    return HeightmapBundle(
        heightmap_mm=heightmap_mm,
        min_height_mm=min_mm,
        max_height_mm=max_mm,
        height_px=int(arr.shape[0]),
        width_px=int(arr.shape[1]),
        metadata=metadata,
    )


def load_subject_mask(mask_path: Path, target_shape: tuple[int, int]) -> np.ndarray:
    """Load a mask PNG, resize to (H, W), return float32 in [0, 1]."""
    img = Image.open(mask_path).convert("L")
    if (img.height, img.width) != target_shape:
        img = img.resize((target_shape[1], target_shape[0]), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32) / 255.0


def subject_background_separation_mm(
    heightmap_mm: np.ndarray, subject_mask: np.ndarray
) -> float:
    """Mean(subject) − mean(background) in mm. Higher is better."""
    subject = subject_mask > 0.5
    if subject.sum() == 0 or (~subject).sum() == 0:
        return float("nan")
    return float(heightmap_mm[subject].mean() - heightmap_mm[~subject].mean())


def background_flatness_mm(heightmap_mm: np.ndarray, subject_mask: np.ndarray) -> float:
    """std(background) in mm. Lower is better."""
    background = subject_mask <= 0.5
    if background.sum() == 0:
        return float("nan")
    return float(heightmap_mm[background].std())


def hard_mask_ridge_mm_per_pixel(
    heightmap_mm: np.ndarray,
    subject_mask: np.ndarray,
    band_radius_px: int = 5,
) -> float:
    """Max gradient magnitude (mm/pixel) within band_radius_px of mask edge."""
    binary = (subject_mask > 0.5).astype(np.uint8) * 255
    pil = Image.fromarray(binary, mode="L")
    kernel_size = band_radius_px * 2 + 1
    dilated = np.asarray(pil.filter(ImageFilter.MaxFilter(kernel_size)))
    eroded = np.asarray(pil.filter(ImageFilter.MinFilter(kernel_size)))
    band = (dilated > 0) & (eroded == 0)

    grad_y, grad_x = np.gradient(heightmap_mm)
    grad_mag = np.sqrt(grad_x**2 + grad_y**2)

    if band.sum() == 0:
        return float("nan")
    return float(grad_mag[band].max())


def high_frequency_noise_ratio(
    heightmap_mm: np.ndarray,
    cutoff_fraction_of_nyquist: float = 1.0 / 3.0,
) -> float:
    """Ratio of high-pass spectral energy to total energy. Lower is better.

    cutoff_fraction_of_nyquist=1/3 means count energy above 1/3 of the
    image's Nyquist as "high-frequency printable noise."
    """
    centered = heightmap_mm - float(heightmap_mm.mean())
    fft = np.fft.fft2(centered)
    psd = np.abs(fft) ** 2

    h, w = heightmap_mm.shape
    fy = np.fft.fftfreq(h, d=1.0)
    fx = np.fft.fftfreq(w, d=1.0)
    yy, xx = np.meshgrid(fy, fx, indexing="ij")
    radial_freq = np.sqrt(xx**2 + yy**2)

    nyquist = 0.5
    cutoff = cutoff_fraction_of_nyquist * nyquist

    total = float(psd.sum())
    if total <= 0:
        return float("nan")
    return float(psd[radial_freq > cutoff].sum() / total)


def composition_gradient_correlation(
    source_image_path: Path,
    heightmap_mm: np.ndarray,
    coarse_shape: tuple[int, int] = (70, 50),
) -> float:
    """Correlation between source-image edges and heightmap edges.

    This preserves the intent of the old composition gate without comparing
    brightness directly. A relief may correctly turn dark pixels into high
    geometry, so the useful signal is whether major image edges still land in
    the same places after conversion.
    """
    source = Image.open(source_image_path).convert("L")
    source = source.resize((coarse_shape[1], coarse_shape[0]), Image.BILINEAR)
    source_arr = np.asarray(source, dtype=np.float32) / 255.0

    h_min = float(heightmap_mm.min())
    h_max = float(heightmap_mm.max())
    span = max(h_max - h_min, 1e-6)
    height_uint8 = ((heightmap_mm - h_min) / span * 255.0).astype(np.uint8)
    height_pil = Image.fromarray(height_uint8, mode="L")
    height_pil = height_pil.resize((coarse_shape[1], coarse_shape[0]), Image.BILINEAR)
    height_arr = np.asarray(height_pil, dtype=np.float32) / 255.0

    source_edges = _gradient_magnitude(source_arr).ravel()
    height_edges = _gradient_magnitude(height_arr).ravel()
    source_std = float(source_edges.std())
    height_std = float(height_edges.std())
    if source_std <= 1e-8 or height_std <= 1e-8:
        return float("nan")
    return float(np.corrcoef(source_edges, height_edges)[0, 1])


def _gradient_magnitude(arr: np.ndarray) -> np.ndarray:
    grad_y, grad_x = np.gradient(arr)
    return np.sqrt(grad_x**2 + grad_y**2)


def face_detection(heightmap_mm: np.ndarray) -> tuple[bool, int]:
    """Run OpenCV Haar frontal-face detection on a render of the heightmap.

    Returns (any_face_detected, face_count).
    """
    import cv2

    h_min = float(heightmap_mm.min())
    h_max = float(heightmap_mm.max())
    span = max(h_max - h_min, 1e-6)
    img = ((heightmap_mm - h_min) / span * 255.0).astype(np.uint8)

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return False, 0

    faces = detector.detectMultiScale(img, scaleFactor=1.1, minNeighbors=3)
    return (len(faces) > 0, int(len(faces)))


def compute_all_gates(
    heightmap_path: Path,
    metadata_path: Path,
    *,
    subject_mask_path: Path | None = None,
    source_image_path: Path | None = None,
) -> dict[str, Any]:
    """Compute every gate metric. Skipped metrics are recorded with a reason."""
    bundle = load_heightmap_bundle(heightmap_path, metadata_path)
    h = bundle.heightmap_mm

    result: dict[str, Any] = {
        "provider": bundle.metadata.get("height_provider"),
        "job_id": bundle.metadata.get("job_id"),
        "min_height_mm": bundle.min_height_mm,
        "max_height_mm": bundle.max_height_mm,
        "height_range_mm": bundle.max_height_mm - bundle.min_height_mm,
        "metrics": {},
        "skipped": {},
    }

    result["metrics"]["high_frequency_noise_ratio"] = high_frequency_noise_ratio(h)

    try:
        any_face, n_faces = face_detection(h)
        result["metrics"]["face_detected"] = any_face
        result["metrics"]["face_count"] = n_faces
    except ImportError:
        result["skipped"]["face_detected"] = "opencv-python not installed"
        result["skipped"]["face_count"] = "opencv-python not installed"

    if source_image_path is not None and source_image_path.exists():
        result["metrics"]["composition_gradient_correlation"] = (
            composition_gradient_correlation(source_image_path, h)
        )
    else:
        result["skipped"]["composition_gradient_correlation"] = "no source image"

    if subject_mask_path is not None and subject_mask_path.exists():
        mask = load_subject_mask(subject_mask_path, h.shape)
        result["metrics"]["subject_background_separation_mm"] = (
            subject_background_separation_mm(h, mask)
        )
        result["metrics"]["background_flatness_mm"] = background_flatness_mm(h, mask)
        result["metrics"]["hard_mask_ridge_mm_per_pixel"] = hard_mask_ridge_mm_per_pixel(
            h, mask
        )
    else:
        for k in (
            "subject_background_separation_mm",
            "background_flatness_mm",
            "hard_mask_ridge_mm_per_pixel",
        ):
            result["skipped"][k] = "no canonical subject mask"

    return result
