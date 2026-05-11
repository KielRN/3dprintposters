import numpy as np

from app.depth import DepthInferenceResult, SubjectMaskResult
from app.providers.base import ProviderAudit


def fake_depth_result(width: int, height: int) -> DepthInferenceResult:
    row = np.linspace(0.2, 0.8, width, dtype=np.float32)
    return DepthInferenceResult(
        depth=np.tile(row, (height, 1)),
        audit=ProviderAudit(succeeded="stub-depth", model_version="stub:v1"),
    )


def fake_subject_mask_result(
    width: int,
    height: int,
    *,
    y_start: int,
    y_end: int,
    x_start: int,
    x_end: int,
) -> SubjectMaskResult:
    mask = np.zeros((height, width), dtype=np.float32)
    mask[y_start:y_end, x_start:x_end] = 1.0
    return SubjectMaskResult(
        mask=mask,
        status="ok",
        audit=ProviderAudit(
            succeeded="stub-segmentation",
            model_version="stub:v1",
        ),
        mask_coverage=float(np.mean(mask > 0.5)),
        foreground_labels=("person",),
        raw_segment_count=1,
    )


def mean_adjacent_delta(values: np.ndarray) -> float:
    vertical = np.mean(np.abs(np.diff(values, axis=0)))
    horizontal = np.mean(np.abs(np.diff(values, axis=1)))
    return float(vertical + horizontal)
