"""
Storage seam for the media library.

Everything that talks to the actual object store (Cloudinary today) lives here,
so a future move to S3/R2 is a change to this one module rather than the upload
service. The service layer only ever calls `store_image()` and `build_variants()`.

We deliberately go straight to `cloudinary.uploader` rather than through the
Django storage backend because a single upload call returns the public_id,
dimensions and byte size we need — and it lets us pin the public_id to the
content hash so the stored object is content-addressed (a re-upload of the same
bytes overwrites the same object instead of creating a Cloudinary duplicate).
"""

import cloudinary.uploader
import cloudinary.utils
import requests

# Cloudinary folder all library assets live under.
MEDIA_FOLDER = 'media_library'

# Bound each upload the same way core.storage does, so a network blip fails
# fast instead of hanging a worker.
UPLOAD_TIMEOUT_SECONDS = 30

# Derivative widths we advertise. Cloudinary generates each on first request
# (f_auto → AVIF/WebP/JPEG negotiation, q_auto → quality), so this is instant
# and stores no extra files.
VARIANT_WIDTHS = (200, 400, 800, 1600)


def store_image(data, public_id, folder=MEDIA_FOLDER):
    """
    Upload raw image bytes to Cloudinary under a content-addressed public_id.

    Returns the raw Cloudinary response dict (public_id, secure_url, width,
    height, bytes, format, …).

    `overwrite=False` is a deliberate storage-layer safety guarantee, NOT an
    optimisation. The dedup check in services.ingest_upload already means we only
    reach this function on a hash miss, so we should never be uploading an
    existing key in normal operation. `overwrite=False` is the belt-and-braces:
    if a bug ever computed the wrong hash or two requests raced, Cloudinary
    refuses to clobber the existing object (it returns the existing asset
    instead) rather than silently destroying a live image that other DB rows
    reference. Content-addressed key + no-overwrite = a live asset is never lost.
    """
    return cloudinary.uploader.upload(
        data,
        public_id=public_id,
        folder=folder,
        resource_type='image',
        overwrite=False,
        unique_filename=False,
        use_filename=False,
        timeout=UPLOAD_TIMEOUT_SECONDS,
    )


def build_variants(storage_key, original_width=None):
    """
    Build the transform-URL map for an asset from its Cloudinary public_id.

    Widths larger than the original are skipped (never upscale). Returns e.g.
    {'200': 'https://…w_200,f_auto,q_auto…', ..., 'original': 'https://…'}.
    """
    variants = {}
    for w in VARIANT_WIDTHS:
        if original_width and w > original_width:
            continue
        url, _ = cloudinary.utils.cloudinary_url(
            storage_key, width=w, crop='limit',
            fetch_format='auto', quality='auto', secure=True,
        )
        variants[str(w)] = url

    original_url, _ = cloudinary.utils.cloudinary_url(storage_key, secure=True)
    variants['original'] = original_url
    return variants


def fetch_image_bytes(url, timeout=30):
    """
    Download the raw bytes of an existing image (used by the data migration to
    hash legacy Cloudinary files). Isolated here so it can be mocked in tests.
    """
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content
