from pathlib import Path
from typing import Protocol

from google.cloud import storage as gcs_storage


class StorageAdapter(Protocol):
    def read_bytes(self, path: str) -> bytes: ...

    def write_bytes(self, path: str, data: bytes, *, content_type: str) -> None: ...


class LocalFilesystemStorage:
    def read_bytes(self, path: str) -> bytes:
        return Path(path).read_bytes()

    def write_bytes(self, path: str, data: bytes, *, content_type: str) -> None:
        del content_type
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


class GoogleCloudStorage:
    def __init__(self, bucket_name: str | None = None) -> None:
        self.client = gcs_storage.Client()
        self.bucket_name = bucket_name

    def read_bytes(self, path: str) -> bytes:
        bucket_name, blob_name = self._split_path(path)
        return self.client.bucket(bucket_name).blob(blob_name).download_as_bytes()

    def write_bytes(self, path: str, data: bytes, *, content_type: str) -> None:
        bucket_name, blob_name = self._split_path(path)
        blob = self.client.bucket(bucket_name).blob(blob_name)
        blob.upload_from_string(data, content_type=content_type)

    def _split_path(self, path: str) -> tuple[str, str]:
        if path.startswith("gs://"):
            without_scheme = path.removeprefix("gs://")
            bucket_name, _, blob_name = without_scheme.partition("/")
            if not bucket_name or not blob_name:
                raise ValueError("GCS paths must be formatted as gs://bucket/object")
            return bucket_name, blob_name

        if not self.bucket_name:
            raise ValueError("A default GCS bucket is required for relative storage paths")
        return self.bucket_name, path.lstrip("/")


def artifact_path(prefix: str, relative_path: str) -> str:
    clean_relative = relative_path.strip("/")
    if prefix.startswith("gs://"):
        return f"{prefix.rstrip('/')}/{clean_relative}"
    return (Path(prefix) / clean_relative).as_posix()
