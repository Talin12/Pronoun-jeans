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


# ── Video ────────────────────────────────────────────────────────────────────
#
# Cloudinary keeps video under a separate resource type, so every call below has
# to say so explicitly — a video uploaded as resource_type='image' is accepted
# and then delivers a broken URL. Transcoding happens on delivery, exactly like
# image derivatives: we upload the original once and reference renditions by
# transform, so nothing here waits on an encode.

VIDEO_UPLOAD_TIMEOUT_SECONDS = 180

# Playback renditions we advertise, by width. A phone gets 480/720 instead of a
# 4K original, which is the whole point — an untranscoded clip off a modern
# camera is tens of megabytes to fill a player a few hundred pixels wide.
VIDEO_VARIANT_WIDTHS = (480, 720, 1080)


def store_video(fileobj, public_id, folder=MEDIA_FOLDER):
    """
    Upload a video to Cloudinary under a content-addressed public_id.

    Takes a file object, NOT bytes — unlike store_image. A video is up to
    100 MB, and Django has already spooled anything that size to disk; reading
    it into a bytes object here would pull the whole file back into a worker
    that has 512 MB to live on, and `upload_large` would then copy it again.
    Handing over the stream keeps peak memory at one chunk.

    Same content-addressing and same `overwrite=False` guarantee as
    store_image(): the dedup check upstream means we only get here on a hash
    miss, and refusing to overwrite means a hash bug or a race can never destroy
    a live asset other rows reference.

    upload_large rather than upload: Cloudinary caps a single upload request
    well below the account's video size limit, and a 60 MB clip off a phone is
    over that cap. Streaming it in 20 MB parts means the limit that applies is
    the one we validate against.

    The folder is baked into public_id instead of being passed as `folder`,
    which store_image does. That is not a style difference — upload_large loops
    over the chunks and, after the first one, sets
    `options['public_id'] = <the folder-qualified id the server returned>`.
    A `folder` still sitting in those options is prepended a second time, so
    anything over one chunk lands at media/media_library/media/media_library/…
    and every URL we then build 404s. One fully-qualified id is re-sendable.
    """
    return cloudinary.uploader.upload_large(
        fileobj,
        public_id=f'{delivery_id(folder)}/{public_id}' if folder else public_id,
        resource_type='video',
        overwrite=False,
        unique_filename=False,
        use_filename=False,
        chunk_size=20 * 1024 * 1024,
        timeout=VIDEO_UPLOAD_TIMEOUT_SECONDS,
    )


def video_url(storage_key, width=None, fmt='auto'):
    """
    A playback URL for a stored video.

    `q_auto` picks the bitrate and `f_auto` negotiates the container per browser.
    Pass an explicit `fmt` to build a <source> the browser chooses by type, or
    fmt=None for the original file untouched.
    """
    opts = {'resource_type': 'video', 'quality': 'auto', 'secure': True}
    if fmt:
        opts['fetch_format'] = fmt
    if width:
        opts.update(width=width, crop='limit')
    url, _ = cloudinary.utils.cloudinary_url(delivery_id(storage_key), **opts)
    return url


def video_poster_url(storage_key, width=800):
    """
    Still frame used as the <video poster> and as the library thumbnail.

    Cloudinary renders it from the video itself — asking for the video's
    public_id in an image format returns a frame — so a clip needs no separately
    uploaded thumbnail. Without a poster, a video tile is a black rectangle
    until the browser decides to fetch metadata.
    """
    url, _ = cloudinary.utils.cloudinary_url(
        delivery_id(storage_key), resource_type='video', format='jpg',
        width=width, crop='limit', quality='auto', secure=True,
    )
    return url


def build_video_variants(storage_key, original_width=None):
    """
    Transform-URL map for a video: playback renditions, poster frames and the
    untouched original. Mirrors build_variants() for images, and skips widths
    above the source so a 480p clip is never upscaled to 1080.
    """
    variants = {}
    for w in VIDEO_VARIANT_WIDTHS:
        if original_width and w > original_width:
            continue
        variants[str(w)] = video_url(storage_key, width=w)

    variants['mp4']          = video_url(storage_key, fmt='mp4')
    variants['webm']         = video_url(storage_key, fmt='webm')
    variants['poster']       = video_poster_url(storage_key, width=800)
    variants['poster_thumb'] = video_poster_url(storage_key, width=200)
    variants['original']     = video_url(storage_key, fmt=None)
    return variants


def fetch_image_bytes(url, timeout=30):
    """
    Download the raw bytes of an existing image (used by the data migration to
    hash legacy Cloudinary files). Isolated here so it can be mocked in tests.
    """
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content
