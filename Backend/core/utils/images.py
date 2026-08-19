"""
Image upload handling: validation + automatic compression.

Cloudinary (our media storage) rejects files larger than 10 MB, which
previously surfaced as a bare 500 in the admin. Every image field should
use CompressedImageField so that:
  1. Oversized / non-image uploads fail with a friendly form error.
  2. Valid images are downscaled and re-encoded before they reach
     Cloudinary, so they never hit the 10 MB limit.
"""

import io
import os

import cloudinary.utils
from django.core.exceptions import ValidationError
from django.db import models
from django.template.defaultfilters import filesizeformat
from PIL import Image, ImageOps

# Reject anything above this outright — even compression shouldn't have to
# chew through a file this big. Set well above real camera output (48 MP RAW-to-
# JPEG exports land ~20–40 MB) so those uploads reach the compressor instead of
# being bounced before it can shrink them under Cloudinary's 10 MB limit.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Long-edge cap and re-encode quality for stored images. 3840 px (4K) is far
# larger than any storefront display size, and q90 is the visually-lossless
# threshold — together they keep a re-encoded 40 MB photo comfortably under
# Cloudinary's 10 MB cap while staying indistinguishable from the original.
MAX_DIMENSION = 3840
JPEG_QUALITY = 90
WEBP_QUALITY = 92

# Files already below this size AND within MAX_DIMENSION are stored BYTE-FOR-BYTE
# unchanged (zero re-encode, zero quality loss). Held just under Cloudinary's
# 10 MB free-tier limit so the only images we ever recompress are the ones that
# genuinely can't fit otherwise.
PASSTHROUGH_BYTES = 9 * 1024 * 1024


def validate_image_upload(file):
    """
    Field/form validator: friendly errors instead of a 500.
    Checks the size cap and that Pillow can actually read the file.
    """
    size = getattr(file, 'size', None)
    if size and size > MAX_UPLOAD_BYTES:
        raise ValidationError(
            f'This image is too large ({filesizeformat(size)}). '
            f'Please upload an image under {filesizeformat(MAX_UPLOAD_BYTES)}.'
        )

    try:
        pos = file.tell()
        img = Image.open(file)
        img.verify()
        file.seek(pos)
    except Exception:
        try:
            file.seek(0)
        except Exception:
            pass
        raise ValidationError(
            'This file is not a supported image. '
            'Please upload a JPEG, PNG or WebP image.'
        )


def thumbnail_url(image_field, width=96):
    """
    A small CDN-resized delivery URL for admin thumbnails (w_/f_auto/q_auto).

    The image itself is unchanged — Cloudinary just serves a scaled copy on the
    fly — so an admin list/inline downloads a few KB per thumb instead of the
    multi-MB original. Same technique medialib's picker already uses. Falls back
    to the raw `.url` if the field is empty or a transform URL can't be built.
    """
    if not image_field:
        return ''
    try:
        public_id = os.path.splitext(image_field.name)[0]
        url, _ = cloudinary.utils.cloudinary_url(
            public_id, width=width, crop='limit',
            fetch_format='auto', quality='auto', secure=True,
        )
        return url
    except Exception:
        try:
            return image_field.url
        except Exception:
            return ''


def compress_image(file, name):
    """
    Downscale to MAX_DIMENSION on the long edge and re-encode
    (JPEG for opaque images, WebP when transparency must be kept).

    Returns (content_bytes_io, new_name), or None if the file is already
    small enough to store unchanged or cannot be processed (in which case
    the caller should fall back to the original file).
    """
    try:
        file.seek(0)
        # Image.open() only reads the header, so mode and size are known before
        # anything is decoded.
        img = Image.open(file)

        has_alpha = (
            img.mode in ('RGBA', 'LA')
            or (img.mode == 'P' and 'transparency' in img.info)
        )

        size = getattr(file, 'size', None) or 0
        if size <= PASSTHROUGH_BYTES and max(img.size) <= MAX_DIMENSION:
            file.seek(0)
            return None

        # Decode straight to roughly the size we want. For JPEG, libjpeg can
        # scale by 1/2, 1/4 or 1/8 during decode, so a 48 MP photo costs ~36 MB
        # of RAM instead of ~144 MB. It only kicks in past 2x the target — a
        # 12 MP photo still decodes in full — but the biggest camera uploads are
        # exactly the ones that threaten a 512 MB worker. No-op for other
        # formats, and it never decodes below the requested size.
        img.draft('RGB', (MAX_DIMENSION, MAX_DIMENSION))
        img.load()
    except Exception:
        return None

    # Respect EXIF orientation before stripping metadata on re-encode.
    img = ImageOps.exif_transpose(img)
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    base, _ = os.path.splitext(os.path.basename(name))
    buf = io.BytesIO()
    if has_alpha:
        img = img.convert('RGBA')
        img.save(buf, 'WEBP', quality=WEBP_QUALITY)
        new_name = f'{base}.webp'
    else:
        img = img.convert('RGB')
        img.save(buf, 'JPEG', quality=JPEG_QUALITY, optimize=True)
        new_name = f'{base}.jpg'
    buf.seek(0)
    return buf, new_name


class CompressedImageField(models.ImageField):
    """
    ImageField that validates uploads (size + real image) and compresses
    them in pre_save, so nothing oversized ever reaches Cloudinary.
    """
    default_validators = [validate_image_upload]

    def pre_save(self, model_instance, add):
        field_file = getattr(model_instance, self.attname)
        # _committed is False only for freshly assigned uploads; existing
        # files (e.g. product clones sharing an image) are left untouched.
        if field_file and not field_file._committed:
            result = compress_image(field_file.file, field_file.name)
            if result is not None:
                buf, new_name = result
                field_file.file = buf
                field_file.name = new_name
        return super().pre_save(model_instance, add)
