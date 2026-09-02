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

Video takes the same path with steps 1 and 2 swapped for their video
equivalents: the container is sniffed from the file's own bytes, and nothing is
re-encoded on the way in — Cloudinary transcodes on delivery, so the bytes we
hash are the bytes the admin picked. Everything after that (dedup, attachment,
ordering, the legacy bridge) is deliberately type-agnostic, which is what lets a
product gallery be one ordered list of mixed media.

Variant generation is NOT a background job: Cloudinary produces derivatives
on-the-fly from URL transforms, so step 5 just records the transform recipes
(instant) and the admin upload response stays fast.
"""

import hashlib
import io
import os

from django.apps import apps
from django.db.models import Q
from django.utils import timezone
from PIL import Image

from core.utils.images import MAX_UPLOAD_BYTES, compress_image
from . import storage
from .models import MediaAsset, MediaAttachment

# Real image formats we accept (checked against the decoded signature, not the
# client-supplied extension or Content-Type). HEIF/HEIC (Pillow reports both as
# "HEIF") is accepted on the way in but never stored as-is — compress_image
# re-encodes it to JPEG, so what lands in Cloudinary is always web-deliverable.
# Requires pillow-heif for the HEIC signature to decode.
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'AVIF', 'HEIF', 'HEIC'}

_FORMAT_TO_MIME = {
    'JPEG': 'image/jpeg',
    'PNG':  'image/png',
    'WEBP': 'image/webp',
    'AVIF': 'image/avif',
    # HEIF is re-encoded to JPEG before storage, so this only applies to the rare
    # file compress_image couldn't process and stored raw.
    'HEIF': 'image/heif',
    'HEIC': 'image/heic',
}

# Single source of truth: the same outright-reject ceiling CompressedImageField
# enforces. The compressor (shared with that field) then shrinks anything under
# this to fit Cloudinary, so the two paths never disagree on what's accepted.

# Video containers we accept, keyed by the signature we detect rather than by
# the client-supplied extension. MOV is included because that is what an iPhone
# hands over, and Cloudinary transcodes it to something the web can play.
_VIDEO_MIME = {
    'mp4':  'video/mp4',
    'webm': 'video/webm',
    'mov':  'video/quicktime',
}

# Video is not re-encoded on ingest, so this is a cap on what actually travels
# over the wire, not on what we store. Sized to Cloudinary's free-tier per-file
# video limit.
MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB


class MediaValidationError(Exception):
    """Raised for a rejected upload; the API layer maps this to HTTP 400."""


def compute_hash(data):
    """SHA-256 hex digest of the given bytes — the dedup key."""
    return hashlib.sha256(data).hexdigest()


def hash_file(file, chunk_size=1024 * 1024):
    """
    The same digest as compute_hash(), read a chunk at a time.

    Used for video, where the file can be 100 MB: hashing it as one bytes object
    would hold the whole upload in a worker that has 512 MB total. Leaves the
    file rewound for whoever reads it next.
    """
    digest = hashlib.sha256()
    file.seek(0)
    for chunk in iter(lambda: file.read(chunk_size), b''):
        digest.update(chunk)
    file.seek(0)
    return digest.hexdigest()


# ISO-BMFF major brands that are STILL IMAGES, not video. HEIC and AVIF use the
# very same 'ftyp' container as MP4/MOV and differ only by this brand, so without
# this check an iPhone HEIC (or an AVIF) is misrouted to the video path and fails
# deep inside a Cloudinary video upload instead of being decoded as an image.
_ISO_IMAGE_BRANDS = {
    b'heic', b'heix', b'heim', b'heis',   # HEIF still image (HEVC)
    b'hevc', b'hevm', b'hevs',            # HEVC image sequence
    b'mif1', b'msf1',                     # generic HEIF / sequence
    b'avif', b'avis',                     # AVIF still / sequence
}


def sniff_video_container(head):
    """
    Identify a video container from its first bytes, or None if it is not one.

    Signature-based rather than extension-based for the same reason the image
    path decodes rather than trusting Content-Type: the filename and the
    browser-supplied MIME are both attacker- (and Finder-) controlled, and an
    upload routed down the wrong branch fails much later and much less clearly.
    """
    if head[:4] == b'\x1aE\xdf\xa3':
        # EBML — Matroska/WebM. Cloudinary transcodes either.
        return 'webm'
    if head[4:8] == b'ftyp':
        # ISO base media: MP4, QuickTime, HEIC and AVIF all share this header and
        # differ only by the major brand that follows it.
        brand = head[8:12]
        if brand in _ISO_IMAGE_BRANDS:
            return None  # a HEIC/AVIF image, handled by the image path
        return 'mov' if brand == b'qt  ' else 'mp4'
    return None


def _read_head(file, size=16):
    file.seek(0)
    head = file.read(size)
    file.seek(0)
    return head


def _validate_video(file):
    """Size cap for a video upload. The container was already sniffed."""
    size = getattr(file, 'size', None)
    if size is not None and size > MAX_VIDEO_UPLOAD_BYTES:
        raise MediaValidationError(
            f'Video is too large ({size} bytes). '
            f'Maximum is {MAX_VIDEO_UPLOAD_BYTES} bytes.'
        )


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
        # We get here only after sniff_video_container() said "not a video", so
        # an unplayable container (AVI, MKV-in-name-only, a .mov that is really
        # something else) lands here and the message has to cover both kinds.
        raise MediaValidationError(
            'File is not a supported image or video. '
            'Images: JPEG, PNG, WebP, AVIF. Videos: MP4, WebM, MOV.'
        )

    file.seek(0)
    fmt = (Image.open(file).format or '').upper()
    file.seek(0)
    if fmt not in ALLOWED_FORMATS:
        raise MediaValidationError(
            f'Unsupported image type "{fmt or "unknown"}". '
            f'Allowed: JPEG, PNG, WebP, AVIF, HEIC.'
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


def _existing_asset(file_hash, categories):
    """
    The already-stored asset for this content, or None.

    Shared by both ingest paths: dedup is on the bytes, so it neither knows nor
    cares whether they are a photo or a clip.
    """
    existing = MediaAsset.objects.filter(file_hash=file_hash).first()
    if existing is None:
        return None
    if existing.deleted_at is not None:
        # Someone re-uploaded a previously soft-deleted file — revive it rather
        # than creating a hash-colliding row (the unique constraint would reject
        # that anyway).
        existing.deleted_at = None
        existing.save(update_fields=['deleted_at', 'updated_at'])
    if categories:
        existing.categories.add(*categories)
    return existing


def _ingest_video(file, container, *, uploaded_by, folder, filename,
                  title, alt_text, categories):
    """
    Ingest one uploaded video. Same contract as ingest_upload().

    Nothing is re-encoded here. Cloudinary produces the playable renditions from
    URL transforms at delivery time exactly as it does for image derivatives, so
    an ingest that transcoded would spend a request's worth of CPU producing a
    file nobody ever fetches.

    Dimensions and duration come from the upload response rather than from
    probing the file, which keeps ffmpeg off the server's dependency list.

    The file is hashed and uploaded as a stream, never held whole in memory: a
    100 MB clip read into a bytes object is a fifth of the worker's RAM before
    Cloudinary's chunker has copied anything.
    """
    _validate_video(file)

    file_hash = hash_file(file)
    existing = _existing_asset(file_hash, categories)
    if existing is not None:
        return existing, True

    upload_kwargs = {'public_id': file_hash}
    if folder:
        upload_kwargs['folder'] = folder
    resp = storage.store_video(file, **upload_kwargs)

    storage_key = storage.strip_prefix(resp.get('public_id') or file_hash)
    width       = resp.get('width')
    height      = resp.get('height')
    variants    = storage.build_video_variants(storage_key, original_width=width)

    asset = MediaAsset.objects.create(
        storage_key       = storage_key,
        media_type        = 'video',
        file_hash         = file_hash,
        original_filename = os.path.basename(filename),
        mime_type         = _VIDEO_MIME.get(container, 'video/mp4'),
        width             = width,
        height            = height,
        duration          = resp.get('duration'),
        # Cloudinary reports what it received; getattr is the fallback for a
        # response shape that omits it.
        file_size         = resp.get('bytes') or getattr(file, 'size', None),
        title             = title,
        alt_text          = alt_text,
        folder            = folder or '',
        variants          = variants,
        uploaded_by       = uploaded_by,
    )
    if categories:
        asset.categories.add(*categories)
    return asset, False


def ingest_upload(file, *, uploaded_by=None, folder=None, filename=None,
                  title='', alt_text='', categories=None):
    """
    Ingest one uploaded image or video, deduplicating by content hash.

    The kind is decided from the file's own signature, so callers (the Django
    admin picker, the JWT admin API) stay a single upload endpoint that accepts
    whatever the admin drops on it.

    `categories` is an iterable of Category ids — the library sections the file
    should appear under. They are ADDED, never replaced, so re-uploading a photo
    into a second section files it under both instead of moving it.

    Returns (asset, deduplicated: bool).
    Raises MediaValidationError on an invalid/oversized/unsupported file.
    """
    filename = filename or getattr(file, 'name', '') or 'upload'

    container = sniff_video_container(_read_head(file))
    if container is not None:
        return _ingest_video(
            file, container, uploaded_by=uploaded_by, folder=folder,
            filename=filename, title=title, alt_text=alt_text,
            categories=categories,
        )

    source_format = _validate(file)
    data, stored_name = _final_bytes(file, filename, source_format)

    file_hash = compute_hash(data)

    # ── Dedup: does this exact content already exist? ──────────────────────────
    existing = _existing_asset(file_hash, categories)
    if existing is not None:
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

    # Store the key WITHOUT the delivery prefix — the Phase 7 bridge writes it
    # into legacy FileFields, and Django's storage adds the prefix back when it
    # builds their URLs. See medialib.storage.DELIVERY_PREFIX.
    storage_key = storage.strip_prefix(resp.get('public_id') or file_hash)
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
    if categories:
        asset.categories.add(*categories)
    return asset, False


# ─────────────────────────────────────────────────────────────────────────────
# Attachment operations (shared by the Django-admin picker views AND the JWT
# admin API). Each mutation reconciles the corresponding legacy FileField
# column(s) via sync_legacy() so picked images render on the storefront
# immediately — see the Phase 7 bridge note below.
# ─────────────────────────────────────────────────────────────────────────────

def live_assets():
    return MediaAsset.objects.filter(deleted_at__isnull=True)


def in_category(qs, category_id):
    """
    Narrow an asset queryset to one library section. A main category also covers
    its sub-categories, so "Men" shows everything filed under "Men → Boxers".
    """
    return qs.filter(
        Q(categories__id=category_id) | Q(categories__parent_id=category_id)
    ).distinct()


def categorize_assets(media_ids, *, add=(), remove=()):
    """
    File existing assets into library sections (or take them out again). Sections
    are additive per asset, so this never disturbs memberships it wasn't asked
    about. Returns the number of assets touched.
    """
    assets = list(live_assets().filter(id__in=media_ids))
    for asset in assets:
        if add:
            asset.categories.add(*add)
        if remove:
            asset.categories.remove(*remove)
    return len(assets)


def list_attachments(attachable_type, attachable_id, role=None):
    """
    Attachments for an entity, newest-role-agnostic by default.

    Pass `role` to get one slot only. A picker bound to a role MUST do this:
    the cover ('primary') and the gallery are independent slots, and a picker
    that renders the unfiltered list would offer a remove button that detaches
    another slot's attachment — taking the cover away with a gallery image.
    """
    qs = (MediaAttachment.objects
          .filter(attachable_type=attachable_type, attachable_id=attachable_id,
                  media__deleted_at__isnull=True)
          .select_related('media')
          .order_by('sort_order', 'id'))
    return qs.filter(role=role) if role else qs


def attach_assets(attachable_type, attachable_id, media_ids, role='gallery'):
    """
    Attach media assets to an entity under a role. Returns the newly
    created/existing MediaAttachment rows. Raises ValueError on unknown media.

    'primary' is a SINGLE slot and is enforced as one here, not just in the UI:
    the cover is whatever was picked last, and every other primary row is
    dropped. Enforcing it server-side also heals entities that ended up with
    several primaries — the next cover pick collapses them back to one.
    """
    live = {a.id: a for a in live_assets().filter(id__in=media_ids)}
    missing = [m for m in media_ids if m not in live]
    if missing:
        raise ValueError(f'Unknown or deleted media: {missing}')

    # A video can sit in a gallery but never in a single-image slot. The cover,
    # the category tile and the hero banner are all rendered as <img> and are
    # what the share card and the catalogue grid read; a video there would show
    # as a broken image, and for a product it would also empty the legacy
    # `image` column that the catalogue queryset filters on — quietly delisting
    # the product. Refuse it here rather than in the UI, since both the Django
    # admin picker and the JWT API reach this function.
    if role != 'gallery':
        videos = [a.original_filename or a.id for a in live.values()
                  if a.media_type == 'video']
        if videos:
            raise ValueError(
                f'Video can only be added to a gallery, not to the "{role}" slot: {videos}'
            )

    if role == 'primary':
        media_ids = media_ids[:1]
        MediaAttachment.objects.filter(
            attachable_type=attachable_type, attachable_id=attachable_id, role='primary',
        ).exclude(media_id__in=media_ids).delete()

    base = (MediaAttachment.objects
            .filter(attachable_type=attachable_type, attachable_id=attachable_id, role=role)
            .order_by('-sort_order').values_list('sort_order', flat=True).first()) or 0

    created = []
    for offset, mid in enumerate(media_ids, start=1):
        att, _ = MediaAttachment.objects.get_or_create(
            media_id=mid, attachable_type=attachable_type,
            attachable_id=attachable_id, role=role,
            defaults={'sort_order': base + offset},
        )
        created.append(att)

    sync_legacy(attachable_type, attachable_id, role)  # PHASE 7 BRIDGE
    return created


def detach_assets(attachable_type, attachable_id, *, attachment_id=None, media_id=None, role=None):
    """Detach media from an entity. Never deletes the underlying asset. Returns count."""
    qs = MediaAttachment.objects.filter(
        attachable_type=attachable_type, attachable_id=attachable_id,
    )
    if attachment_id is not None:
        qs = qs.filter(id=attachment_id)
    elif media_id is not None:
        qs = qs.filter(media_id=media_id)
        if role:
            qs = qs.filter(role=role)
    else:
        raise ValueError('attachment_id or media_id required')

    affected_roles = set(qs.values_list('role', flat=True))
    deleted, _ = qs.delete()

    for r in affected_roles:
        sync_legacy(attachable_type, attachable_id, r)  # PHASE 7 BRIDGE
    return deleted



# ── Deleting an asset ────────────────────────────────────────────────────────

class AssetInUse(Exception):
    """Raised when a delete would pull a file out from under something using it."""

    def __init__(self, usage_count):
        self.usage_count = usage_count
        super().__init__(f'Asset is used in {usage_count} place(s).')


def soft_delete_asset(asset, *, force=False):
    """
    Retire one asset from the library. Returns the number of places it was
    detached from (0 unless forced).

    Soft delete only: `deleted_at` is stamped and the Cloudinary file is left
    alone. That is deliberate and it is what makes this safe to offer in the
    panel — the row stops appearing in the library and in every storefront
    query, but nothing is destroyed, and re-uploading the same file revives the
    very same asset because dedup matches on content hash (see _existing_asset).

    An asset that is still attached somewhere raises AssetInUse rather than
    disappearing from a live product page. `force=True` accepts that and
    detaches it everywhere first — through detach_assets, so each affected
    (entity, role) has its legacy column reconciled on the way out. Deleting the
    attachment rows directly would leave Product.image and friends still
    pointing at a file the library no longer lists, which renders on the
    storefront as a broken image.
    """
    attachments = list(asset.attachments.all())
    usage = len(attachments)

    if usage and not force:
        raise AssetInUse(usage)

    if usage:
        # Grouped so one entity with three of this asset's images costs one
        # reconcile per role rather than one per attachment.
        for attachable_type, attachable_id in {
            (a.attachable_type, a.attachable_id) for a in attachments
        }:
            detach_assets(attachable_type, attachable_id, media_id=asset.id)

    asset.deleted_at = timezone.now()
    asset.save(update_fields=['deleted_at', 'updated_at'])
    return usage


def reorder_assets(attachable_type, attachable_id, order):
    """`order` is a list of attachment ids in the desired order. Returns updated count."""
    lookup = {
        a.id: a for a in MediaAttachment.objects.filter(
            id__in=order, attachable_type=attachable_type, attachable_id=attachable_id,
        )
    }
    to_update = []
    for idx, att_id in enumerate(order):
        att = lookup.get(att_id)
        if att and att.sort_order != idx:
            att.sort_order = idx
            to_update.append(att)
    if to_update:
        MediaAttachment.objects.bulk_update(to_update, ['sort_order'])

    for r in {a.role for a in lookup.values()}:
        sync_legacy(attachable_type, attachable_id, r)  # PHASE 7 BRIDGE
    return len(to_update)


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 7 BRIDGE — REMOVE AT CUTOVER.
#
# Until the storefront renders from media_attachments, an image picked from the
# library would render nowhere because the frontend still reads the legacy
# FileField columns. This mirrors every attach/detach/reorder into the
# corresponding legacy column(s) so picked images appear immediately. It is a
# PLAIN STRING ASSIGNMENT of the asset's Cloudinary public_id into the FileField
# — NO upload, NO file movement. Delete this block and its callers at cutover.
# ─────────────────────────────────────────────────────────────────────────────

LEGACY_MAP = {
    ('product',       'primary'): {'kind': 'single', 'model': 'products.Product',          'field': 'image'},
    ('product',       'gallery'): {'kind': 'multi',  'model': 'products.ProductImage',      'fk': 'product_id',   'field': 'image', 'order': 'order', 'alt': 'alt_text'},
    ('product_color', 'gallery'): {'kind': 'single', 'model': 'products.ProductColorImage', 'field': 'image'},
    ('variation',     'primary'): {'kind': 'single', 'model': 'products.ProductVariation',  'field': 'image'},
    ('variation',     'gallery'): {'kind': 'multi',  'model': 'products.VariationImage',    'fk': 'variation_id', 'field': 'image', 'order': 'order', 'alt': 'alt_text'},
    ('category',      'primary'): {'kind': 'single', 'model': 'products.Category',          'field': 'image'},
    ('banner',        'primary'): {'kind': 'single', 'model': 'products.HeroSlide',         'field': 'image'},
}


def _pubid(name):
    """Extensionless storage path, matching MediaAsset.storage_key from migration."""
    return os.path.splitext(name or '')[0]


def sync_legacy(attachable_type, attachable_id, role):
    """
    PHASE 7 BRIDGE: reconcile the legacy column(s) for one (type, id, role) from
    the current MediaAttachment set. Idempotent, and never touches purely-legacy
    rows that were never in the library (matched via storage_key ↔ MediaAsset).
    """
    cfg = LEGACY_MAP.get((attachable_type, role))
    if not cfg:
        return
    Model = apps.get_model(cfg['model'])
    field = cfg['field']

    # Images only. The legacy columns are ImageFields, so a video written into
    # one would break the storefront's <img> and the Django admin's thumbnail
    # alike — and there is nothing to bridge anyway, because the storefront
    # reads video straight off the attachments (ProductSerializer.library_media)
    # rather than from a legacy column.
    atts = list(
        MediaAttachment.objects
        .filter(attachable_type=attachable_type, attachable_id=attachable_id,
                role=role, media__deleted_at__isnull=True,
                media__media_type='image')
        .select_related('media').order_by('sort_order', 'id')
    )
    desired = [(a.media.storage_key, a.sort_order, a.media.alt_text or '') for a in atts]
    desired_pubids = {sk for sk, _, _ in desired}

    if cfg['kind'] == 'single':
        obj = Model.objects.filter(pk=attachable_id).first()
        if obj is None:
            return
        current = _pubid(getattr(obj, field).name)
        if desired:
            target = desired[0][0]           # lowest sort_order wins the single slot
            if current != target:
                setattr(obj, field, target)  # string assignment → no upload
                obj.save(update_fields=[field])
        elif current and MediaAsset.objects.filter(storage_key=current).exists():
            setattr(obj, field, '')
            obj.save(update_fields=[field])
        return

    # multi
    fk = cfg['fk']
    existing = list(Model.objects.filter(**{fk: attachable_id}))
    existing_by_pub = {_pubid(getattr(r, field).name): r for r in existing}

    for sk, order, alt in desired:
        row = existing_by_pub.get(sk)
        if row is None:
            Model.objects.create(**{
                fk: attachable_id, field: sk,       # string assignment → no upload
                cfg['order']: order, cfg['alt']: alt,
            })
        elif getattr(row, cfg['order']) != order:
            setattr(row, cfg['order'], order)
            row.save(update_fields=[cfg['order']])

    for pub, row in existing_by_pub.items():
        if pub not in desired_pubids and MediaAsset.objects.filter(storage_key=pub).exists():
            row.delete()
# ── end Phase 7 bridge ───────────────────────────────────────────────────────
