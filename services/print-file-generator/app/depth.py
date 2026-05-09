from dataclasses import dataclass
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


def get_depth_provider(name: HeightmapProviderName) -> Any:
    providers = {
        "posterized_luminance": LuminanceDepthProvider,
        "continuous_luminance": ContinuousLuminanceDepthProvider,
        "lithophane_baseline": LithophaneBaselineDepthProvider,
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
