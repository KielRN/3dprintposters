import argparse
import sys
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(SERVICE_ROOT))

from app.models import PrintFileGenerationRequest, ReliefSettings  # noqa: E402
from app.packages import generate_print_file_bundle  # noqa: E402
from app.storage import LocalFilesystemStorage  # noqa: E402


PROVIDERS = [
    "posterized_luminance",
    "continuous_luminance",
    "lithophane_baseline",
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run experiment 1 heightmap providers against one local source image.",
    )
    parser.add_argument("source_image", type=Path)
    parser.add_argument("--job-id", default=None)
    parser.add_argument("--uid", default="local_experiment")
    parser.add_argument("--target-width-px", type=int, default=200)
    parser.add_argument("--max-source-pixels", type=int, default=16_000_000)
    parser.add_argument("--contrast", type=float, default=1.0)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--post-smooth-radius-px", type=float, default=0.6)
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
        help="Provider to run. Repeat to compare several. Defaults to all experiment 1 providers.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=REPO_ROOT / ".tmp" / "experiments" / "experiment_1",
    )
    args = parser.parse_args()

    source_image = args.source_image.resolve()
    if not source_image.exists():
        raise SystemExit(f"Source image does not exist: {source_image}")

    providers = args.provider or PROVIDERS
    job_id = args.job_id or source_image.stem

    for provider in providers:
        output_prefix = args.output_root / provider / job_id
        request = PrintFileGenerationRequest(
            job_id=job_id,
            uid=args.uid,
            selected_image_path=str(source_image),
            output_prefix=str(output_prefix),
            relief=ReliefSettings(
                height_provider=provider,
                max_source_pixels=args.max_source_pixels,
                target_width_px=args.target_width_px,
                contrast=args.contrast,
                gamma=args.gamma,
                post_smooth_radius_px=args.post_smooth_radius_px,
                heightmap_png_bit_depth=args.heightmap_png_bit_depth,
            ),
        )
        response = generate_print_file_bundle(request, storage=LocalFilesystemStorage())
        print(f"{provider}: {response.status} -> {output_prefix}")


if __name__ == "__main__":
    main()
