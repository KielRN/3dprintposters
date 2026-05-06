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


def build_closed_relief_mesh(
    heightmap: np.ndarray,
    *,
    width_mm: float,
    height_mm: float,
) -> ReliefMesh:
    if heightmap.ndim != 2:
        raise ValueError("Heightmap must be a 2D array")

    rows, cols = heightmap.shape
    if rows < 2 or cols < 2:
        raise ValueError("Heightmap must be at least 2x2")

    x_scale = width_mm / (cols - 1)
    y_scale = height_mm / (rows - 1)
    vertices: list[Vertex] = []

    for y in range(rows):
        for x in range(cols):
            vertices.append((x * x_scale, y * y_scale, float(heightmap[y, x])))

    bottom_offset = len(vertices)
    for y in range(rows):
        for x in range(cols):
            vertices.append((x * x_scale, y * y_scale, 0.0))

    faces: list[Face] = []

    def top_index(x: int, y: int) -> int:
        return y * cols + x

    def bottom_index(x: int, y: int) -> int:
        return bottom_offset + y * cols + x

    for y in range(rows - 1):
        for x in range(cols - 1):
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

    for x in range(cols - 1):
        t0 = top_index(x, 0)
        t1 = top_index(x + 1, 0)
        b0 = bottom_index(x, 0)
        b1 = bottom_index(x + 1, 0)
        faces.append((t0, b0, t1))
        faces.append((t1, b0, b1))

        y = rows - 1
        t0 = top_index(x, y)
        t1 = top_index(x + 1, y)
        b0 = bottom_index(x, y)
        b1 = bottom_index(x + 1, y)
        faces.append((t0, t1, b0))
        faces.append((t1, b1, b0))

    for y in range(rows - 1):
        t0 = top_index(0, y)
        t1 = top_index(0, y + 1)
        b0 = bottom_index(0, y)
        b1 = bottom_index(0, y + 1)
        faces.append((t0, t1, b0))
        faces.append((t1, b1, b0))

        x = cols - 1
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
        max_z_mm=float(np.max(heightmap)),
    )


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
