from collections import Counter
from dataclasses import dataclass

from .depth import Heightmap
from .models import PrintFileGenerationRequest
from .relief import ReliefMesh


BOUNDS_TOLERANCE_MM = 0.001


@dataclass(frozen=True)
class PrintabilityReport:
    status: str
    checks: list[str]
    warnings: list[str]
    failures: list[str]


def evaluate_printability(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    heightmap: Heightmap,
    binary_stl_size: int,
) -> PrintabilityReport:
    checks: list[str] = []
    warnings: list[str] = []
    failures: list[str] = []

    _check_bounds(request=request, mesh=mesh, checks=checks, failures=failures)
    _check_base_and_relief(
        request=request,
        heightmap=heightmap,
        checks=checks,
        failures=failures,
    )
    _check_triangle_count(request=request, mesh=mesh, checks=checks, failures=failures)
    _check_stl_size(
        request=request,
        binary_stl_size=binary_stl_size,
        checks=checks,
        failures=failures,
    )
    _check_watertight(mesh=mesh, checks=checks, failures=failures)

    if failures:
        status = "failed"
    elif warnings:
        status = "passed_with_warnings"
    else:
        status = "passed"

    return PrintabilityReport(
        status=status,
        checks=checks,
        warnings=warnings,
        failures=failures,
    )


def require_printable(report: PrintabilityReport) -> None:
    if report.failures:
        raise ValueError("Printability checks failed: " + "; ".join(report.failures))


def _check_bounds(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    checks: list[str],
    failures: list[str],
) -> None:
    target_width = request.dimensions.target_width_mm
    target_height = request.dimensions.target_height_mm
    xs = [vertex[0] for vertex in mesh.vertices]
    ys = [vertex[1] for vertex in mesh.vertices]
    zs = [vertex[2] for vertex in mesh.vertices]

    within_bounds = (
        _close(min(xs), 0.0)
        and _close(max(xs), target_width)
        and _close(min(ys), 0.0)
        and _close(max(ys), target_height)
        and _close(min(zs), 0.0)
        and _close(mesh.width_mm, target_width)
        and _close(mesh.height_mm, target_height)
    )
    if within_bounds:
        checks.append("physical_bounds_match_target")
    else:
        failures.append(
            "relief bounds must match "
            f"{target_width:.3f}mm x {target_height:.3f}mm with a 0mm base plane"
        )


def _check_base_and_relief(
    *,
    request: PrintFileGenerationRequest,
    heightmap: Heightmap,
    checks: list[str],
    failures: list[str],
) -> None:
    base = request.relief.base_thickness_mm
    min_relief = heightmap.min_height_mm - base
    max_relief = heightmap.max_height_mm - base

    if heightmap.min_height_mm + BOUNDS_TOLERANCE_MM >= base:
        checks.append("base_thickness_meets_minimum")
    else:
        failures.append(f"minimum height must preserve {base:.3f}mm base thickness")

    relief_in_range = (
        min_relief + BOUNDS_TOLERANCE_MM >= request.relief.min_relief_mm
        and max_relief <= request.relief.max_relief_mm + BOUNDS_TOLERANCE_MM
    )
    if relief_in_range:
        checks.append("relief_depth_within_requested_range")
    else:
        failures.append(
            "relief depth must stay between "
            f"{request.relief.min_relief_mm:.3f}mm and "
            f"{request.relief.max_relief_mm:.3f}mm"
        )


def _check_triangle_count(
    *,
    request: PrintFileGenerationRequest,
    mesh: ReliefMesh,
    checks: list[str],
    failures: list[str],
) -> None:
    triangle_count = len(mesh.faces)
    if triangle_count <= request.relief.max_triangle_count:
        checks.append("triangle_count_within_limit")
    else:
        failures.append(
            f"triangle count {triangle_count} exceeds limit "
            f"{request.relief.max_triangle_count}"
        )


def _check_stl_size(
    *,
    request: PrintFileGenerationRequest,
    binary_stl_size: int,
    checks: list[str],
    failures: list[str],
) -> None:
    if binary_stl_size <= request.relief.max_binary_stl_bytes:
        checks.append("binary_stl_size_within_limit")
    else:
        failures.append(
            f"binary STL size {binary_stl_size} bytes exceeds limit "
            f"{request.relief.max_binary_stl_bytes} bytes"
        )


def _check_watertight(
    *,
    mesh: ReliefMesh,
    checks: list[str],
    failures: list[str],
) -> None:
    edges: Counter[tuple[int, int]] = Counter()
    for face in mesh.faces:
        if len(set(face)) != 3:
            failures.append("mesh contains a degenerate triangle")
            return

        a, b, c = face
        edges.update(
            [
                tuple(sorted((a, b))),
                tuple(sorted((b, c))),
                tuple(sorted((c, a))),
            ]
        )

    open_edges = [edge for edge, count in edges.items() if count != 2]
    if not open_edges:
        checks.append("mesh_is_watertight")
    else:
        failures.append(f"mesh has {len(open_edges)} non-manifold or open edges")


def _close(actual: float, expected: float) -> bool:
    return abs(actual - expected) <= BOUNDS_TOLERANCE_MM
