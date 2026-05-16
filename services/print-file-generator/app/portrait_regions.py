from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

import numpy as np
from PIL import Image, ImageOps


FaceAnalysisStatus = Literal["no_face", "single_face", "multiple_faces"]


@dataclass(frozen=True)
class PortraitRegionMasks:
    face_oval: np.ndarray
    central_face: np.ndarray
    eyes: np.ndarray
    nose: np.ndarray
    mouth: np.ndarray
    status: FaceAnalysisStatus
    face_count: int
    detector: str
    boxes: tuple[tuple[int, int, int, int], ...] = ()

    def to_metadata(self) -> dict[str, object]:
        return {
            "status": self.status,
            "face_count": self.face_count,
            "detector": self.detector,
            "regions": {
                "face_oval": _mask_summary(self.face_oval),
                "central_face": _mask_summary(self.central_face),
                "eyes": _mask_summary(self.eyes),
                "nose": _mask_summary(self.nose),
                "mouth": _mask_summary(self.mouth),
            },
        }


def analyze_portrait_regions(image: Image.Image) -> PortraitRegionMasks:
    """Detect coarse portrait regions for relief tuning, never recognition."""
    width, height = image.size
    empty = _empty_masks(width, height, detector="opencv_haar_unavailable")

    detector = _load_haar_detector()
    if detector is None:
        return empty

    grayscale = np.asarray(ImageOps.grayscale(image), dtype=np.uint8)
    try:
        faces = detector.detectMultiScale(
            grayscale,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(max(16, width // 10), max(16, height // 10)),
        )
    except Exception:
        return empty

    boxes = _sort_face_boxes(tuple(tuple(int(v) for v in face) for face in faces))
    if not boxes:
        return _empty_masks(width, height, detector="opencv_haar")

    return masks_from_face_boxes(
        width=width,
        height=height,
        boxes=boxes,
        detector="opencv_haar",
    )


def masks_from_face_boxes(
    *,
    width: int,
    height: int,
    boxes: tuple[tuple[int, int, int, int], ...],
    detector: str = "provided",
) -> PortraitRegionMasks:
    """Build soft semantic portrait masks from face boxes.

    Boxes are ``(x, y, width, height)`` in image coordinates. Region positions
    are intentionally broad and soft because they tune relief texture, not
    identity or exact facial landmarks.
    """
    if not boxes:
        return _empty_masks(width, height, detector=detector)

    face_oval = np.zeros((height, width), dtype=np.float32)
    central_face = np.zeros_like(face_oval)
    eyes = np.zeros_like(face_oval)
    nose = np.zeros_like(face_oval)
    mouth = np.zeros_like(face_oval)

    for box in boxes:
        x, y, w, h = box
        if w <= 0 or h <= 0:
            continue

        face_oval = np.maximum(
            face_oval,
            _soft_ellipse(
                width,
                height,
                x + 0.50 * w,
                y + 0.53 * h,
                0.46 * w,
                0.58 * h,
            ),
        )
        central_face = np.maximum(
            central_face,
            _soft_ellipse(
                width,
                height,
                x + 0.50 * w,
                y + 0.52 * h,
                0.33 * w,
                0.42 * h,
            ),
        )
        left_eye = _soft_ellipse(
            width, height, x + 0.34 * w, y + 0.39 * h, 0.17 * w, 0.075 * h
        )
        right_eye = _soft_ellipse(
            width, height, x + 0.66 * w, y + 0.39 * h, 0.17 * w, 0.075 * h
        )
        eyes = np.maximum(eyes, np.maximum(left_eye, right_eye))
        nose = np.maximum(
            nose,
            _soft_ellipse(
                width,
                height,
                x + 0.50 * w,
                y + 0.55 * h,
                0.13 * w,
                0.21 * h,
            ),
        )
        mouth = np.maximum(
            mouth,
            _soft_ellipse(
                width,
                height,
                x + 0.50 * w,
                y + 0.72 * h,
                0.24 * w,
                0.095 * h,
            ),
        )

    valid_boxes = tuple(box for box in boxes if box[2] > 0 and box[3] > 0)
    face_count = len(valid_boxes)
    status: FaceAnalysisStatus
    if face_count == 0:
        status = "no_face"
    elif face_count == 1:
        status = "single_face"
    else:
        status = "multiple_faces"

    return PortraitRegionMasks(
        face_oval=face_oval.clip(0.0, 1.0).astype(np.float32),
        central_face=central_face.clip(0.0, 1.0).astype(np.float32),
        eyes=eyes.clip(0.0, 1.0).astype(np.float32),
        nose=nose.clip(0.0, 1.0).astype(np.float32),
        mouth=mouth.clip(0.0, 1.0).astype(np.float32),
        status=status,
        face_count=face_count,
        detector=detector,
        boxes=valid_boxes,
    )


def _empty_masks(width: int, height: int, *, detector: str) -> PortraitRegionMasks:
    empty = np.zeros((height, width), dtype=np.float32)
    return PortraitRegionMasks(
        face_oval=empty,
        central_face=empty,
        eyes=empty,
        nose=empty,
        mouth=empty,
        status="no_face",
        face_count=0,
        detector=detector,
    )


def _soft_ellipse(
    width: int,
    height: int,
    center_x: float,
    center_y: float,
    radius_x: float,
    radius_y: float,
) -> np.ndarray:
    if width <= 0 or height <= 0 or radius_x <= 0 or radius_y <= 0:
        return np.zeros((height, width), dtype=np.float32)

    y_grid, x_grid = np.mgrid[0:height, 0:width].astype(np.float32)
    distance = (
        ((x_grid - center_x) / max(radius_x, 1e-6)) ** 2
        + ((y_grid - center_y) / max(radius_y, 1e-6)) ** 2
    )
    # Feather the last 30% of the ellipse so masks can shape texture gently.
    soft = (1.0 - distance) / 0.30
    return _smoothstep(soft.clip(0.0, 1.0)).astype(np.float32)


def _smoothstep(values: np.ndarray) -> np.ndarray:
    return values * values * (3.0 - 2.0 * values)


def _sort_face_boxes(
    boxes: tuple[tuple[int, int, int, int], ...],
) -> tuple[tuple[int, int, int, int], ...]:
    return tuple(sorted(boxes, key=lambda box: box[2] * box[3], reverse=True))


def _mask_summary(mask: np.ndarray) -> dict[str, object]:
    return {
        "coverage": float(np.mean(mask > 0.05)) if mask.size else 0.0,
        "peak": float(np.max(mask)) if mask.size else 0.0,
    }


@lru_cache(maxsize=1)
def _load_haar_detector() -> object | None:
    try:
        import cv2
    except Exception:
        return None

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return None
    return detector
