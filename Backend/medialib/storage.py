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

import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
import requests

# Cloudinary folder all library assets live under.
MEDIA_FOLDER = 'media_library'

# Django's storage backend (core.storage.TimeoutMediaCloudinaryStorage, on top of
# django-cloudinary-storage) puts everything it uploads under `media/` and adds
# that prefix again when it builds a URL from a FileField name. The Phase 7
# bridge writes MediaAsset.storage_key straight into those FileFields, and the
# migration recorded storage_key from FileField names, so ONE convention has to
# hold across both worlds:
#
#     storage_key is the path WITHOUT the prefix (e.g. 'products/<hash>');
#     the real Cloudinary object is at 'media/products/<hash>'.
#
# Upload puts files there, delivery_id() puts the prefix back for URLs, and
# Django re-adds it by itself for the legacy columns. Getting this wrong is what
# made library images 404 the moment they were attached to a product.
DELIVERY_PREFIX = 'media'


def delivery_id(storage_key):
    """The real Cloudinary public_id for a stored key. Idempotent."""
    if not storage_key:
        return storage_key
    if storage_key == DELIVERY_PREFIX or storage_key.startswith(f'{DELIVERY_PREFIX}/'):
        return storage_key
    return f'{DELIVERY_PREFIX}/{storage_key}'


def strip_prefix(public_id):
    """Inverse of delivery_id(): a Cloudinary public_id back to a storage_key."""
    prefix = f'{DELIVERY_PREFIX}/'
    return public_id[len(prefix):] if public_id.startswith(prefix) else public_id

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
        # Land under the same prefix Django's storage uses, so an asset works
        # both from the library (delivery_id) and once the Phase 7 bridge has
        # written its key into a legacy FileField.
        folder=delivery_id(folder),
        resource_type='image',
        overwrite=False,
        unique_filename=False,
        use_filename=False,
        timeout=UPLOAD_TIMEOUT_SECONDS,
    )


def rename_asset(from_public_id, to_public_id):
    """Move an existing Cloudinary object. Server-side; no re-upload."""
    return cloudinary.uploader.rename(
        from_public_id, to_public_id, timeout=UPLOAD_TIMEOUT_SECONDS,
    )


def asset_exists(public_id):
    """True when a Cloudinary image object exists at this public_id."""
    try:
        cloudinary.api.resource(public_id, resource_type='image')
        return True
    except Exception:
        return False


def build_variants(storage_key, original_width=None):
    """
    Build the transform-URL map for an asset from its storage_key.

    Widths larger than the original are skipped (never upscale). Returns e.g.
    {'200': 'https://…w_200,f_auto,q_auto…', ..., 'original': 'https://…'}.
    """
    public_id = delivery_id(storage_key)
    variants = {}
    for w in VARIANT_WIDTHS:
        if original_width and w > original_width:
            continue
        url, _ = cloudinary.utils.cloudinary_url(
            public_id, width=w, crop='limit',
            fetch_format='auto', quality='auto', secure=True,
        )
        variants[str(w)] = url

    original_url, _ = cloudinary.utils.cloudinary_url(public_id, secure=True)
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
