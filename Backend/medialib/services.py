"""
Upload pipeline for the media library.

`ingest_upload()` is the single entry point every admin upload path will call.
It deduplicates by content hash, so uploading a file that already exists returns
the existing asset instead of writing a second copy — this is the fix for the
admin re-uploading the same photo into different slots.

Flow:
  1. Validate (real image signature, allowed format, size cap).
  2. Run the SAME compression the rest of the site uses, so the bytes we hash
     and store match what CompressedImageField would have produced.
  3. SHA-256 the final bytes.
  4. Look up file_hash — on a hit, return that asset (deduplicated=True),
     reviving it if it was soft-deleted. No Cloudinary write.
  5. On a miss, upload to storage under a content-addressed key and insert
     the MediaAsset row.

Variant generation is NOT a background job: Cloudinary produces derivatives
on-the-fly from URL transforms, so step 5 just records the transform recipes
(instant) and the admin upload response stays fast.
"""

import hashlib
import io
import os

from PIL import Image

from core.utils.images import compress_image
from . import storage
from .models import MediaAsset

# Real image formats we accept (checked against the decoded signature, not the
# client-supplied extension or Content-Type).
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'AVIF'}

_FORMAT_TO_MIME = {
    'JPEG': 'image/jpeg',
    'PNG':  'image/png',
    'WEBP': 'image/webp',
    'AVIF': 'image/avif',
}

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


class MediaValidationError(Exception):
    """Raised for a rejected upload; the API layer maps this to HTTP 400."""


def compute_hash(data):
    """SHA-256 hex digest of the given bytes — the dedup key."""
    return hashlib.sha256(data).hexdigest()


def _validate(file):
    """Signature + format + size checks. Returns the detected source format."""
    size = getattr(file, 'size', None)
    if size is not None and size > MAX_UPLOAD_BYTES:
        raise MediaValidationError(
            f'Image is too large ({size} bytes). Maximum is {MAX_UPLOAD_BYTES} bytes.'
        )

    try:
        file.seek(0)
        probe = Image.open(file)
        probe.verify()          # verifies signature; invalidates `probe`
    except Exception:
        raise MediaValidationError('File is not a valid image.')

    file.seek(0)
    fmt = (Image.open(file).format or '').upper()
    file.seek(0)
    if fmt not in ALLOWED_FORMATS:
        raise MediaValidationError(
            f'Unsupported image type "{fmt or "unknown"}". '
            f'Allowed: JPEG, PNG, WebP, AVIF.'
        )
    return fmt


def _final_bytes(file, filename, source_format):
    """
    Produce the bytes we will actually store and hash.

    Reuses core.utils.images.compress_image so a file stored here is byte-for-byte
    what CompressedImageField would have stored — otherwise dedup against
    existing/migrated assets would never match.
    """
    file.seek(0)
    raw = file.read()
    file.seek(0)

    result = compress_image(file, filename)
    if result is not None:
        buf, new_name = result
        return buf.getvalue(), new_name

    # Small enough to store unchanged.
    return raw, filename


def ingest_upload(file, *, uploaded_by=None, folder=None, filename=None,
                  title='', alt_text=''):
    """
    Ingest one uploaded image, deduplicating by content hash.

    Returns (asset, deduplicated: bool).
    Raises MediaValidationError on an invalid/oversized/unsupported file.
    """
    filename = filename or getattr(file, 'name', '') or 'upload'

    source_format = _validate(file)
    data, stored_name = _final_bytes(file, filename, source_format)

    file_hash = compute_hash(data)

    # ── Dedup: does this exact content already exist? ──────────────────────────
    existing = MediaAsset.objects.filter(file_hash=file_hash).first()
    if existing is not None:
        if existing.deleted_at is not None:
            # Someone re-uploaded a previously soft-deleted image — revive it
            # rather than creating a hash-colliding row (the unique constraint
            # would reject that anyway).
            existing.deleted_at = None
            existing.save(update_fields=['deleted_at', 'updated_at'])
        return existing, True

    # ── New content: store it and record the asset ────────────────────────────
    with Image.open(io.BytesIO(data)) as img:
        width, height = img.size
        stored_format = (img.format or source_format).upper()

    mime_type = _FORMAT_TO_MIME.get(stored_format, 'application/octet-stream')

    upload_kwargs = {'public_id': file_hash}
    if folder:
        upload_kwargs['folder'] = folder
    resp = storage.store_image(data, **upload_kwargs)

    storage_key = resp.get('public_id') or file_hash
    variants    = storage.build_variants(storage_key, original_width=width)

    asset = MediaAsset.objects.create(
        storage_key       = storage_key,
        file_hash         = file_hash,
        original_filename = os.path.basename(filename),
        mime_type         = mime_type,
        width             = width,
        height            = height,
        file_size         = len(data),
        title             = title,
        alt_text          = alt_text,
        folder            = folder or '',
        variants          = variants,
        uploaded_by       = uploaded_by,
    )
    return asset, False
