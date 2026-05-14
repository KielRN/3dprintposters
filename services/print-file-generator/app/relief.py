import math
import struct
from dataclasses import dataclass

import numpy as np


Vertex = tuple[float, float, float]
Face = tuple[int, int, int]


@dataclass(frozen=True)
class ReliefMesh:
    vertices: list[Vertex]
    faces: list[Face]
    width_mm: float
    height_mm: float
    min_z_mm: float
    max_z_mm: float
    image_window_width_mm: float | None = None
    image_window_height_mm: float | None = None
    border_mm: float = 0.0


def build_closed_relief_mesh(
    heightmap: np.ndarray,
    *,
    width_mm: float,
    height_mm: float,
    image_window_width_mm: float | None = None,
    image_window_height_mm: float | None = None,
    border_mm: float = 0.0,
    border_height_mm: float | None = None,
) -> ReliefMesh:
    if heightmap.ndim != 2:
        raise ValueError("Heightmap must be a 2D array")

    rows, cols = heightmap.shape
    if rows < 2 or cols < 2:
        raise ValueError("Heightmap must be at least 2x2")

    if border_mm < 0:
        raise ValueError("Border must be non-negative")

    if border_mm > 0:
        if image_window_width_mm is None or image_window_height_mm is None:
            raise ValueError("Image window dimensions are required when border is set")
        _validate_window_bounds(
            width_mm=width_mm,
            height_mm=height_mm,
            image_window_width_mm=image_window_width_mm,
            image_window_height_mm=image_window_height_mm,
            border_mm=border_mm,
        )
        flat_border_height = (
            float(np.min(heightmap)) if border_height_mm is None else border_height_mm
        )
        x_coords = _bordered_axis_coords(
            physical_mm=width_mm,
            window_mm=image_window_width_mm,
            border_mm=border_mm,
            source_count=cols,
        )
        y_coords = _bordered_axis_coords(
            physical_mm=height_mm,
            window_mm=image_window_height_mm,
            border_mm=border_mm,
            source_count=rows,
        )
    else:
        image_window_width_mm = width_mm
        image_window_height_mm = height_mm
        x_coords = [x * width_mm / (cols - 1) for x in range(cols)]
        y_coords = [y * height_mm / (rows - 1) for y in range(rows)]
        flat_border_height = 0.0

    top_rows = len(y_coords)
    top_cols = len(x_coords)
    vertices: list[Vertex] = []
    frame_raise_mm = _default_frame_raise_mm(
        heightmap=heightmap,
        border_height_mm=flat_border_height,
        border_mm=border_mm,
    )

    for y in range(top_rows):
        for x in range(top_cols):
            x_mm = x_coords[x]
            y_mm = y_coords[y]
            if border_mm > 0 and not _inside_image_window(
                x_mm=x_mm,
                y_mm=y_mm,
                width_mm=width_mm,
                height_mm=height_mm,
                border_mm=border_mm,
            ):
                z = _frame_height_at(
                    x_mm=x_mm,
                    y_mm=y_mm,
                    width_mm=width_mm,
                    height_mm=height_mm,
                    border_mm=border_mm,
                    border_height_mm=flat_border_height,
                    frame_raise_mm=frame_raise_mm,
                )
            else:
                z = _sample_heightmap_at(
                    heightmap=heightmap,
                    x_mm=x_mm,
                    y_mm=y_mm,
                    border_mm=border_mm,
                    image_window_width_mm=image_window_width_mm,
                    image_window_height_mm=image_window_height_mm,
                )
            vertices.append((x_mm, y_mm, float(z)))

    bottom_offset = len(vertices)
    for y in range(top_rows):
        for x in range(top_cols):
            vertices.append((x_coords[x], y_coords[y], 0.0))

    faces: list[Face] = []

    def top_index(x: int, y: int) -> int:
        return y * top_cols + x

    def bottom_index(x: int, y: int) -> int:
        return bottom_offset + y * top_cols + x

    for y in range(top_rows - 1):
        for x in range(top_cols - 1):
            t00 = top_index(x, y)
            t10 = top_index(x + 1, y)
            t01 = top_index(x, y + 1)
            t11 = top_index(x + 1, y + 1)
            faces.append((t00, t10, t01))
            faces.append((t10, t11, t01))

            b00 = bottom_index(x, y)
            b10 = bottom_index(x + 1, y)
            b01 = bottom_index(x, y + 1)
            b11 = bottom_index(x + 1, y + 1)
            faces.append((b00, b01, b10))
            faces.append((b10, b01, b11))

    for x in range(top_cols - 1):
        t0 = top_index(x, 0)
        t1 = top_index(x + 1, 0)
        b0 = bottom_index(x, 0)
        b1 = bottom_index(x + 1, 0)
        faces.append((t0, b0, t1))
        faces.append((t1, b0, b1))

        y = top_rows - 1
        t0 = top_index(x, y)
        t1 = top_index(x + 1, y)
        b0 = bottom_index(x, y)
        b1 = bottom_index(x + 1, y)
        faces.append((t0, t1, b0))
        faces.append((t1, b1, b0))

    for y in range(top_rows - 1):
        t0 = top_index(0, y)
        t1 = top_index(0, y + 1)
        b0 = bottom_index(0, y)
        b1 = bottom_index(0, y + 1)
        faces.append((t0, t1, b0))
        faces.append((t1, b1, b0))

        x = top_cols - 1
        t0 = top_index(x, y)
        t1 = top_index(x, y + 1)
        b0 = bottom_index(x, y)
        b1 = bottom_index(x, y + 1)
        faces.append((t0, b0, t1))
        faces.append((t1, b0, b1))

    validate_mesh(vertices, faces)

    return ReliefMesh(
        vertices=vertices,
        faces=faces,
        width_mm=width_mm,
        height_mm=height_mm,
        min_z_mm=0.0,
        max_z_mm=float(max(np.max(heightmap), flat_border_height + frame_raise_mm)),
        image_window_width_mm=image_window_width_mm,
        image_window_height_mm=image_window_height_mm,
        border_mm=border_mm,
    )


def _bordered_axis_coords(
    *,
    physical_mm: float,
    window_mm: float,
    border_mm: float,
    source_count: int,
) -> list[float]:
    outer_bevel_mm = min(border_mm * 0.24, 1.6)
    inner_bevel_mm = min(border_mm * 0.30, 2.0)
    inner_lip_mm = border_mm - inner_bevel_mm * 0.35
    frame_coords = [
        0.0,
        outer_bevel_mm,
        border_mm - inner_bevel_mm,
        inner_lip_mm,
        border_mm,
        *(border_mm + index * window_mm / (source_count - 1) for index in range(source_count)),
        physical_mm - border_mm,
        physical_mm - inner_lip_mm,
        physical_mm - border_mm + inner_bevel_mm,
        physical_mm - outer_bevel_mm,
        physical_mm,
    ]
    return _unique_sorted(frame_coords)


def _unique_sorted(values: list[float]) -> list[float]:
    rounded = sorted({round(value, 9) for value in values})
    return [float(value) for value in rounded]


def _default_frame_raise_mm(
    *,
    heightmap: np.ndarray,
    border_height_mm: float,
    border_mm: float,
) -> float:
    if border_mm <= 0:
        return 0.0
    relief_span = max(0.0, float(np.max(heightmap)) - border_height_mm)
    return min(border_mm * 0.14, max(0.55, relief_span * 0.22))


def _inside_image_window(
    *,
    x_mm: float,
    y_mm: float,
    width_mm: float,
    height_mm: float,
    border_mm: float,
) -> bool:
    tolerance = 1e-9
    return (
        x_mm >= border_mm - tolerance
        and x_mm <= width_mm - border_mm + tolerance
        and y_mm >= border_mm - tolerance
        and y_mm <= height_mm - border_mm + tolerance
    )


def _frame_height_at(
    *,
    x_mm: float,
    y_mm: float,
    width_mm: float,
    height_mm: float,
    border_mm: float,
    border_height_mm: float,
    frame_raise_mm: float,
) -> float:
    if border_mm <= 0:
        return border_height_mm

    distance_from_outer_edge = min(x_mm, y_mm, width_mm - x_mm, height_mm - y_mm)
    outer_bevel_mm = min(border_mm * 0.24, 1.6)
    inner_bevel_mm = min(border_mm * 0.30, 2.0)
    shoulder_end_mm = max(outer_bevel_mm, border_mm - inner_bevel_mm)
    peak_height = border_height_mm + frame_raise_mm
    inner_lip_height = border_height_mm + frame_raise_mm * 0.68

    if distance_from_outer_edge <= outer_bevel_mm:
        progress = distance_from_outer_edge / max(outer_bevel_mm, 1e-9)
        return border_height_mm + frame_raise_mm * progress
    if distance_from_outer_edge <= shoulder_end_mm:
        return peak_height

    progress = (distance_from_outer_edge - shoulder_end_mm) / max(
        border_mm - shoulder_end_mm,
        1e-9,
    )
    return peak_height + (inner_lip_height - peak_height) * min(1.0, progress)


def _sample_heightmap_at(
    *,
    heightmap: np.ndarray,
    x_mm: float,
    y_mm: float,
    border_mm: float,
    image_window_width_mm: float,
    image_window_height_mm: float,
) -> float:
    rows, cols = heightmap.shape
    u = (x_mm - border_mm) / image_window_width_mm if image_window_width_mm else 0.0
    v = (y_mm - border_mm) / image_window_height_mm if image_window_height_mm else 0.0
    source_x = min(cols - 1, max(0.0, u * (cols - 1)))
    source_y = min(rows - 1, max(0.0, (1.0 - v) * (rows - 1)))
    return _bilinear_sample(heightmap, source_x=source_x, source_y=source_y)


def _bilinear_sample(
    heightmap: np.ndarray,
    *,
    source_x: float,
    source_y: float,
) -> float:
    x0 = int(math.floor(source_x))
    y0 = int(math.floor(source_y))
    x1 = min(x0 + 1, heightmap.shape[1] - 1)
    y1 = min(y0 + 1, heightmap.shape[0] - 1)
    tx = source_x - x0
    ty = source_y - y0

    top = (1.0 - tx) * float(heightmap[y0, x0]) + tx * float(heightmap[y0, x1])
    bottom = (1.0 - tx) * float(heightmap[y1, x0]) + tx * float(heightmap[y1, x1])
    return (1.0 - ty) * top + ty * bottom


def _validate_window_bounds(
    *,
    width_mm: float,
    height_mm: float,
    image_window_width_mm: float,
    image_window_height_mm: float,
    border_mm: float,
) -> None:
    expected_width = image_window_width_mm + 2 * border_mm
    expected_height = image_window_height_mm + 2 * border_mm
    if abs(width_mm - expected_width) > 0.001:
        raise ValueError("Width must equal image window width plus twice the border")
    if abs(height_mm - expected_height) > 0.001:
        raise ValueError("Height must equal image window height plus twice the border")


def validate_mesh(vertices: list[Vertex], faces: list[Face]) -> None:
    if not vertices:
        raise ValueError("Mesh has no vertices")
    if not faces:
        raise ValueError("Mesh has no faces")

    vertex_count = len(vertices)
    for vertex in vertices:
        if len(vertex) != 3 or not all(math.isfinite(value) for value in vertex):
            raise ValueError("Mesh contains invalid vertex coordinates")

    for face in faces:
        if len(face) != 3:
            raise ValueError("Mesh face must contain three vertex indexes")
        if any(index < 0 or index >= vertex_count for index in face):
            raise ValueError("Mesh face references an invalid vertex")


def binary_stl_bytes(mesh: ReliefMesh, *, name: str = "3dprintposters-relief") -> bytes:
    header = name.encode("ascii", errors="ignore")[:80].ljust(80, b"\0")
    data = bytearray(header)
    data.extend(struct.pack("<I", len(mesh.faces)))

    for face in mesh.faces:
        v0 = mesh.vertices[face[0]]
        v1 = mesh.vertices[face[1]]
        v2 = mesh.vertices[face[2]]
        normal = _normal(v0, v1, v2)
        data.extend(struct.pack("<fff", *normal))
        data.extend(struct.pack("<fff", *v0))
        data.extend(struct.pack("<fff", *v1))
        data.extend(struct.pack("<fff", *v2))
        data.extend(struct.pack("<H", 0))

    return bytes(data)


def _normal(v0: Vertex, v1: Vertex, v2: Vertex) -> Vertex:
    ux, uy, uz = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
    vx, vy, vz = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length == 0:
        return (0.0, 0.0, 0.0)
    return (nx / length, ny / length, nz / length)
