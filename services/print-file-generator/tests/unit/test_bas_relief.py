import numpy as np

from app.depth import _apply_bas_relief_transform


def test_bas_relief_transform_is_not_a_noop() -> None:
    rng = np.random.default_rng(0)
    base = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(280, axis=0)
    detail = rng.normal(0.0, 0.02, size=base.shape).astype(np.float32)
    depth = np.clip(base + detail, 0.0, 1.0)

    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    diff_16bit = float(np.mean(np.abs(depth - relief)) * 65535.0)
    assert diff_16bit >= 1500.0, (
        f"Bas-relief transform mean abs diff {diff_16bit:.0f} (16-bit) is below the "
        f"1500 regression canary; likely back to no-op."
    )


def test_bas_relief_transform_compresses_global_range() -> None:
    depth = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(200, axis=0)
    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    relief_range = float(np.max(relief) - np.min(relief))
    assert relief_range < 0.6, (
        f"Relief range {relief_range:.3f} should be < 0.6 (compression_strength=0.75 "
        f"targets ~0.25 range)"
    )


def test_bas_relief_transform_preserves_local_detail() -> None:
    base = np.linspace(0.0, 1.0, 200, dtype=np.float32)[None, :].repeat(200, axis=0)
    bump = np.zeros_like(base)
    bump[80:120, 80:120] = 0.08
    depth = np.clip(base + bump, 0.0, 1.0)

    relief = _apply_bas_relief_transform(depth, compression_strength=0.75)

    bump_mean = float(relief[80:120, 80:120].mean())
    surround_mean = float(relief[60:80, 80:120].mean())
    assert bump_mean > surround_mean, (
        f"Local bump should still be raised ({bump_mean:.3f}) above surround "
        f"({surround_mean:.3f}) after relief compression"
    )


def test_bas_relief_transform_handles_empty_input() -> None:
    empty = np.zeros((0, 0), dtype=np.float32)
    result = _apply_bas_relief_transform(empty)
    assert result.shape == empty.shape


def test_bas_relief_transform_handles_constant_input() -> None:
    flat = np.full((50, 50), 0.5, dtype=np.float32)
    relief = _apply_bas_relief_transform(flat)
    assert relief.shape == flat.shape
    assert np.all(np.isfinite(relief))
    assert float(relief.min()) >= 0.0 and float(relief.max()) <= 1.0
