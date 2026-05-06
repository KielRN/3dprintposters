import struct

import numpy as np

from app.relief import binary_stl_bytes, build_closed_relief_mesh


def test_closed_relief_mesh_has_top_bottom_and_sidewall_faces() -> None:
    heightmap = np.array(
        [
            [1.0, 2.0],
            [3.0, 4.0],
        ],
        dtype=np.float32,
    )

    mesh = build_closed_relief_mesh(heightmap, width_mm=127.0, height_mm=177.8)

    assert len(mesh.vertices) == 8
    assert len(mesh.faces) == 12
    assert mesh.width_mm == 127.0
    assert mesh.height_mm == 177.8
    assert mesh.min_z_mm == 0.0
    assert mesh.max_z_mm == 4.0

    stl_bytes = binary_stl_bytes(mesh)
    assert struct.unpack("<I", stl_bytes[80:84])[0] == len(mesh.faces)
    assert len(stl_bytes) == 84 + len(mesh.faces) * 50
