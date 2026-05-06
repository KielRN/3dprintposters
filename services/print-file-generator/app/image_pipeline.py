import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError


ALLOWED_IMAGE_FORMATS = {"PNG", "JPEG", "WEBP", "TIFF", "BMP"}


@dataclass(frozen=True)
class NormalizedImage:
    image: Image.Image
    source_width_px: int
    source_height_px: int
    normalized_width_px: int
    normalized_height_px: int
    format: str | None


def load_validated_rgb_image(
    image_bytes: bytes,
    *,
    max_pixels: int,
) -> Image.Image:
    if not image_bytes:
        raise ValueError("Image is empty")

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except UnidentifiedImageError as exc:
        raise ValueError("Unsupported or invalid image") from exc

    image_format = image.format.upper() if image.format else None
    if image_format and image_format not in ALLOWED_IMAGE_FORMATS:
        raise ValueError("Unsupported image format")

    width, height = image.size
    if width < 2 or height < 2:
        raise ValueError("Image must be at least 2x2 pixels")
    if width * height > max_pixels:
        raise ValueError(f"Image is too large; maximum decoded size is {max_pixels} pixels")

    return image.convert("RGB")


def fit_image_to_aspect(
    image: Image.Image,
    *,
    target_width_mm: float,
    target_height_mm: float,
    target_width_px: int,
) -> NormalizedImage:
    source_width, source_height = image.size
    target_aspect = target_width_mm / target_height_mm
    target_height_px = max(2, round(target_width_px / target_aspect))

    source_aspect = source_width / source_height
    if source_aspect > target_aspect:
        crop_width = round(source_height * target_aspect)
        left = (source_width - crop_width) // 2
        crop_box = (left, 0, left + crop_width, source_height)
    else:
        crop_height = round(source_width / target_aspect)
        top = (source_height - crop_height) // 2
        crop_box = (0, top, source_width, top + crop_height)

    resampling = getattr(Image, "Resampling", Image).LANCZOS
    normalized = image.crop(crop_box).resize((target_width_px, target_height_px), resampling)

    return NormalizedImage(
        image=normalized,
        source_width_px=source_width,
        source_height_px=source_height,
        normalized_width_px=target_width_px,
        normalized_height_px=target_height_px,
        format=image.format,
    )


def image_to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
