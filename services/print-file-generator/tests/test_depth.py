import numpy as np
from PIL import Image

from app.depth import LuminanceDepthProvider


def test_posterized_luminance_suppresses_high_frequency_texture() -> None:
    base = np.full((64, 64), 180, dtype=np.uint8)
    base[24:40, 24:40] = 40
    texture = (((np.indices((64, 64)).sum(axis=0) % 2) * 2 - 1) * 30).astype(
        np.int16
    )
    source = np.clip(base.astype(np.int16) + texture, 0, 255).astype(np.uint8)
    image = Image.fromarray(source).convert("RGB")

    heightmap = LuminanceDepthProvider().generate(
        image,
        base_thickness_mm=1.2,
        min_relief_mm=0.4,
        max_relief_mm=3.0,
    )
    raw_heights = 1.2 + 0.4 + (1.0 - source.astype(np.float32) / 255.0) * 2.6

    assert _mean_adjacent_delta(heightmap.values) < _mean_adjacent_delta(raw_heights) * 0.25
    assert heightmap.provider == "posterized_luminance"
    assert heightmap.min_height_mm >= 1.6
    assert heightmap.max_height_mm <= 4.2


def _mean_adjacent_delta(values: np.ndarray) -> float:
    vertical = np.mean(np.abs(np.diff(values, axis=0)))
    horizontal = np.mean(np.abs(np.diff(values, axis=1)))
    return float(vertical + horizontal)
