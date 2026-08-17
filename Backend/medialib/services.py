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

from django.apps import apps
from django.db.models import Q
from PIL import Image

from core.utils.images import compress_image
from . import storage
from .models import MediaAsset, MediaAttachment

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
                  title='', alt_text='', categories=None):
    """
    Ingest one uploaded image, deduplicating by content hash.

    `categories` is an iterable of Category ids — the library sections the image
    should appear under. They are ADDED, never replaced, so re-uploading a photo
    into a second section files it under both instead of moving it.

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
        if categories:
            existing.categories.add(*categories)
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
    Attach media assets to an entity under a role. For the single-slot 'primary'
    role, any existing primary not in `media_ids` is replaced. Returns the newly
    created/existing MediaAttachment rows. Raises ValueError on unknown media.
    """
    live_ids = set(live_assets().filter(id__in=media_ids).values_list('id', flat=True))
    missing = [m for m in media_ids if m not in live_ids]
    if missing:
        raise ValueError(f'Unknown or deleted media: {missing}')

    if role == 'primary':
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

    atts = list(
        MediaAttachment.objects
        .filter(attachable_type=attachable_type, attachable_id=attachable_id,
                role=role, media__deleted_at__isnull=True)
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
