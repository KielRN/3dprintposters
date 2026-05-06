import json
import struct

from .relief import ReliefMesh


JSON_CHUNK_TYPE = 0x4E4F534A
BIN_CHUNK_TYPE = 0x004E4942


def neutral_preview_glb_bytes(
    mesh: ReliefMesh,
    *,
    name: str = "3dprintposters-relief-preview",
) -> bytes:
    position_bytes = b"".join(
        struct.pack("<fff", vertex[0], vertex[1], vertex[2]) for vertex in mesh.vertices
    )
    index_bytes = b"".join(
        struct.pack("<III", face[0], face[1], face[2]) for face in mesh.faces
    )
    binary_chunk = _pad_binary(position_bytes + index_bytes)
    index_offset = len(position_bytes)

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "3DPrintPosters print-file-generator",
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [
            {
                "name": name,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0},
                        "indices": 1,
                        "material": 0,
                        "mode": 4,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "warm-neutral-preview",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.78, 0.76, 0.7, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.82,
                },
            }
        ],
        "buffers": [{"byteLength": len(binary_chunk)}],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": len(position_bytes),
                "target": 34962,
            },
            {
                "buffer": 0,
                "byteOffset": index_offset,
                "byteLength": len(index_bytes),
                "target": 34963,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(mesh.vertices),
                "type": "VEC3",
                "min": _axis_min(mesh),
                "max": _axis_max(mesh),
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5125,
                "count": len(mesh.faces) * 3,
                "type": "SCALAR",
            },
        ],
    }

    json_chunk = _pad_json(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)

    return b"".join(
        [
            struct.pack("<4sII", b"glTF", 2, total_length),
            struct.pack("<II", len(json_chunk), JSON_CHUNK_TYPE),
            json_chunk,
            struct.pack("<II", len(binary_chunk), BIN_CHUNK_TYPE),
            binary_chunk,
        ]
    )


def _axis_min(mesh: ReliefMesh) -> list[float]:
    return [
        min(vertex[0] for vertex in mesh.vertices),
        min(vertex[1] for vertex in mesh.vertices),
        min(vertex[2] for vertex in mesh.vertices),
    ]


def _axis_max(mesh: ReliefMesh) -> list[float]:
    return [
        max(vertex[0] for vertex in mesh.vertices),
        max(vertex[1] for vertex in mesh.vertices),
        max(vertex[2] for vertex in mesh.vertices),
    ]


def _pad_json(data: bytes) -> bytes:
    return data + b" " * (-len(data) % 4)


def _pad_binary(data: bytes) -> bytes:
    return data + b"\0" * (-len(data) % 4)
