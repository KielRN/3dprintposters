import argparse
import sys
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(SERVICE_ROOT))

from app.models import (  # noqa: E402
    PRODUCTION_GEOMETRY_ANALYSIS_WIDTH_PX,
    PRODUCTION_TARGET_WIDTH_PX,
    PrintFileGenerationRequest,
    ReliefSettings,
)
from app.packages import generate_print_file_bundle  # noqa: E402
from app.storage import LocalFilesystemStorage  # noqa: E402


EXPERIMENT_1_PROVIDERS = [
    "posterized_luminance",
    "continuous_luminance",
    "lithophane_baseline",
]
EXPERIMENT_2_PROVIDERS = [
    "depth_anything_v2_small",
]
EXPERIMENT_3_PROVIDERS = [
    "depth_anything_v2_small_bas_relief",
]
EXPERIMENT_4_PROVIDERS = [
    "segformer_masked_depth",
]
HYBRID_PROVIDERS = [
    "masked_depth_detail_blend",
]
EXPERIMENT_5_PROVIDERS = [
    "triposr_sidecar",
]
PROVIDERS = [
    *EXPERIMENT_1_PROVIDERS,
    *EXPERIMENT_2_PROVIDERS,
    *EXPERIMENT_3_PROVIDERS,
    *EXPERIMENT_4_PROVIDERS,
    *HYBRID_PROVIDERS,
    *EXPERIMENT_5_PROVIDERS,
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run heightmap experiment providers against one local source image.",
    )
    parser.add_argument("source_image", type=Path)
    parser.add_argument("--job-id", default=None)
    parser.add_argument("--uid", default="local_experiment")
    parser.add_argument("--target-width-px", type=int, default=PRODUCTION_TARGET_WIDTH_PX)
    parser.add_argument(
        "--geometry-analysis-width-px",
        type=int,
        default=PRODUCTION_GEOMETRY_ANALYSIS_WIDTH_PX,
    )
    parser.add_argument("--max-source-pixels", type=int, default=16_000_000)
    parser.add_argument("--contrast", type=float, default=1.0)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--post-smooth-radius-px", type=float, default=0.6)
    parser.add_argument(
        "--detail-source",
        choices=["lithophane_baseline", "posterized_luminance"],
        default="lithophane_baseline",
        help="Detail source used by masked_depth_detail_blend.",
    )
    parser.add_argument(
        "--detail-weight",
        type=float,
        default=0.38,
        help="Detail blend weight used by masked_depth_detail_blend.",
    )
    parser.add_argument(
        "--heightmap-png-bit-depth",
        type=int,
        choices=[8, 16],
        default=16,
    )
    parser.add_argument(
        "--provider",
        action="append",
        choices=PROVIDERS,
        help="Provider to run. Repeat to compare several. Defaults to experiment 1 providers.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
    )
    args = parser.parse_args()

    source_image = args.source_image.resolve()
    if not source_image.exists():
        raise SystemExit(f"Source image does not exist: {source_image}")

    providers = args.provider or EXPERIMENT_1_PROVIDERS
    job_id = args.job_id or source_image.stem

    # Auto-select output folder based on which experiment is being run
    if args.output_root is None:
        if any(p in EXPERIMENT_5_PROVIDERS for p in providers):
            output_root = REPO_ROOT / ".tmp" / "experiments" / "experiment_5"
        elif any(p in HYBRID_PROVIDERS for p in providers):
            output_root = REPO_ROOT / ".tmp" / "experiments" / "hybrid"
        elif any(p in EXPERIMENT_4_PROVIDERS for p in providers):
            output_root = REPO_ROOT / ".tmp" / "experiments" / "experiment_4"
        elif any(p in EXPERIMENT_3_PROVIDERS for p in providers):
            output_root = REPO_ROOT / ".tmp" / "experiments" / "experiment_3"
        elif any(p in EXPERIMENT_2_PROVIDERS for p in providers):
            output_root = REPO_ROOT / ".tmp" / "experiments" / "experiment_2"
        else:
            output_root = REPO_ROOT / ".tmp" / "experiments" / "experiment_1"
    else:
        output_root = args.output_root

    for provider in providers:
        output_provider = provider
        if provider in HYBRID_PROVIDERS:
            output_provider = f"{provider}__{args.detail_source}"
        output_prefix = output_root / output_provider / job_id
        request = PrintFileGenerationRequest(
            job_id=job_id,
            uid=args.uid,
            selected_image_path=str(source_image),
            output_prefix=str(output_prefix),
            relief=ReliefSettings(
                height_provider=provider,
                max_source_pixels=args.max_source_pixels,
                target_width_px=args.target_width_px,
                geometry_analysis_width_px=args.geometry_analysis_width_px,
                contrast=args.contrast,
                gamma=args.gamma,
                post_smooth_radius_px=args.post_smooth_radius_px,
                detail_source=args.detail_source,
                detail_weight=args.detail_weight,
                heightmap_png_bit_depth=args.heightmap_png_bit_depth,
            ),
        )
        response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())
        print(f"{provider}: {response.status} -> {output_prefix}")


if __name__ == "__main__":
    main()
