from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Heightmap:
    values: np.ndarray
    min_height_mm: float
    max_height_mm: float
    provider: str


class LuminanceDepthProvider:
    name = "luminance"

    def generate(
        self,
        image: Image.Image,
        *,
        base_thickness_mm: float,
        min_relief_mm: float,
        max_relief_mm: float,
    ) -> Heightmap:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        luminance = (
            0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        ) / 255.0

        relief = min_relief_mm + (1.0 - luminance) * (max_relief_mm - min_relief_mm)
        heights = base_thickness_mm + relief

        return Heightmap(
            values=heights.astype(np.float32),
            min_height_mm=float(np.min(heights)),
            max_height_mm=float(np.max(heights)),
            provider=self.name,
        )


def heightmap_to_image_bytes(heightmap: Heightmap) -> bytes:
    from .image_pipeline import image_to_png_bytes

    values = heightmap.values
    height_range = heightmap.max_height_mm - heightmap.min_height_mm
    if height_range <= 0:
        normalized = np.zeros(values.shape, dtype=np.uint8)
    else:
        normalized = (
            (values - heightmap.min_height_mm) / height_range * 255.0
        ).clip(0, 255).astype(np.uint8)

    return image_to_png_bytes(Image.fromarray(normalized, mode="L"))
