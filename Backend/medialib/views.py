"""
Admin-gated JSON API for the media library picker.

Deliberately NOT DRF: the picker only ever runs inside the Django admin session,
so these are plain staff-gated views returning JsonResponse — the same pattern
the existing `variation_upload_images` admin view uses. Auth + CSRF come from the
admin session; the picker JS sends the csrftoken cookie back as X-CSRFToken.
"""

import json
import os

from django.apps import apps
from django.contrib.admin.views.decorators import staff_member_required
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from . import presenters, services
from .models import ATTACHABLE_TYPES, ROLE_CHOICES, MediaAsset, MediaAttachment

_VALID_TYPES = {t for t, _ in ATTACHABLE_TYPES}
_VALID_ROLES = {r for r, _ in ROLE_CHOICES}
DEFAULT_PER_PAGE = 40
MAX_PER_PAGE = 100


def _body(request):
    try:
        return json.loads(request.body or '{}')
    except (ValueError, TypeError):
        return {}


def _live_assets():
    return MediaAsset.objects.filter(deleted_at__isnull=True)


# ── Asset endpoints ───────────────────────────────────────────────────────────

@staff_member_required
@require_GET
def asset_list(request):
    qs = _live_assets()

    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(original_filename__icontains=search)
            | Q(title__icontains=search)
            | Q(alt_text__icontains=search)
            | Q(tags__icontains=search)
        )

    folder = request.GET.get('folder', '').strip()
    if folder:
        qs = qs.filter(folder=folder)

    tag = request.GET.get('tag', '').strip()
    if tag:
        qs = qs.filter(tags__icontains=tag)

    try:
        per_page = min(int(request.GET.get('per_page', DEFAULT_PER_PAGE)), MAX_PER_PAGE)
    except (TypeError, ValueError):
        per_page = DEFAULT_PER_PAGE

    paginator = Paginator(qs, per_page)
    page = paginator.get_page(request.GET.get('page', 1))

    return JsonResponse({
        'results':  [presenters.serialize_asset(a) for a in page.object_list],
        'page':     page.number,
        'pages':    paginator.num_pages,
        'count':    paginator.count,
        'has_next': page.has_next(),
    })


@staff_member_required
@require_GET
def asset_detail(request, asset_id):
    try:
        asset = _live_assets().get(pk=asset_id)
    except MediaAsset.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    return JsonResponse(presenters.serialize_asset(asset, with_usage=True))


@staff_member_required
@require_POST
def asset_upload(request):
    files = request.FILES.getlist('files') or request.FILES.getlist('file')
    if not files:
        return JsonResponse({'error': 'No files provided.'}, status=400)

    folder = request.POST.get('folder', '').strip() or None
    results, errors = [], []
    for f in files:
        try:
            asset, deduped = services.ingest_upload(
                f, uploaded_by=request.user, folder=folder, filename=f.name,
            )
        except services.MediaValidationError as e:
            errors.append({'filename': f.name, 'error': str(e)})
        except Exception:
            errors.append({'filename': f.name, 'error': 'Upload failed, please try again.'})
        else:
            results.append({
                'asset':        presenters.serialize_asset(asset),
                'deduplicated': deduped,
            })

    status = 200 if results else 400
    return JsonResponse({'results': results, 'errors': errors}, status=status)


@staff_member_required
@require_POST
def asset_update(request, asset_id):
    try:
        asset = _live_assets().get(pk=asset_id)
    except MediaAsset.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    data = _body(request)
    fields = []
    for field in ('alt_text', 'title', 'folder'):
        if field in data:
            setattr(asset, field, data[field] or '')
            fields.append(field)
    if 'tags' in data:
        tags = data['tags']
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
        asset.tags = tags or []
        fields.append('tags')

    if fields:
        fields.append('updated_at')
        asset.save(update_fields=fields)
    return JsonResponse(presenters.serialize_asset(asset, with_usage=True))


@staff_member_required
@require_GET
def asset_usage(request, asset_id):
    try:
        asset = MediaAsset.objects.get(pk=asset_id)
    except MediaAsset.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    rows = presenters.usage_for(asset)
    return JsonResponse({'usage': rows, 'count': len(rows)})


@staff_member_required
@require_POST
def asset_delete(request, asset_id):
    """Soft delete. 409 if the asset is in use, unless ?force=true."""
    try:
        asset = MediaAsset.objects.get(pk=asset_id)
    except MediaAsset.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    force = request.GET.get('force', '').lower() in ('1', 'true', 'yes')
    usage = asset.attachments.count()
    if usage > 0 and not force:
        return JsonResponse(
            {'error': f'Asset is used in {usage} place(s).', 'usage_count': usage},
            status=409,
        )

    # Soft delete only — the Cloudinary file is never touched here (a physical
    # purge is a separate, manual step). Detach references only when forced.
    if force and usage > 0:
        asset.attachments.all().delete()

    asset.deleted_at = timezone.now()
    asset.save(update_fields=['deleted_at', 'updated_at'])
    return JsonResponse({'ok': True, 'detached': usage if force else 0})


# ─────────────────────────────────────────────────────────────────────────────
# TEMPORARY PHASE 7 BRIDGE — REMOVE AT CUTOVER.
#
# Until the storefront renders from media_attachments (Phase 7 cutover), an image
# picked from the library would render nowhere, because the frontend still reads
# the legacy FileField columns. This bridge mirrors every attach/detach/reorder
# into the corresponding legacy column(s) so picked images appear immediately.
#
# It is a PLAIN STRING ASSIGNMENT of the asset's existing Cloudinary public_id
# (asset.storage_key) into the FileField — NO upload, NO file movement — exactly
# the pattern the clone action uses (products/admin.py: `ni.image = img.image`).
# A string-assigned FieldFile is `_committed=True`, so CompressedImageField.pre_save
# never re-encodes or re-uploads it.
#
# DELETE this whole block (and its calls in entity_attach/detach/reorder) at the
# Phase 7 cutover, once rendering reads media_attachments directly.
# ─────────────────────────────────────────────────────────────────────────────

# (attachable_type, role) → how to reflect it in the legacy schema.
#   single: one FileField on a row found by pk == attachable_id
#   multi : child rows (fk == attachable_id), ordered, one FileField each
_LEGACY_MAP = {
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


def _sync_legacy(attachable_type, attachable_id, role):
    """
    PHASE 7 BRIDGE: reconcile the legacy column(s) for one (type, id, role) from
    the current MediaAttachment set. Idempotent, and never touches purely-legacy
    rows that were never in the library (matched via storage_key ↔ MediaAsset).
    """
    cfg = _LEGACY_MAP.get((attachable_type, role))
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
            # Detached and the value was a library-managed asset → clear it.
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

    # Remove legacy rows for assets no longer attached (but leave rows that were
    # never part of the library untouched).
    for pub, row in existing_by_pub.items():
        if pub not in desired_pubids and MediaAsset.objects.filter(storage_key=pub).exists():
            row.delete()
# ── end Phase 7 bridge ───────────────────────────────────────────────────────


# ── Attachment endpoints ──────────────────────────────────────────────────────

def _valid_entity(attachable_type):
    return attachable_type in _VALID_TYPES


@staff_member_required
@require_GET
def entity_attachments(request, attachable_type, attachable_id):
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    qs = (MediaAttachment.objects
          .filter(attachable_type=attachable_type, attachable_id=attachable_id,
                  media__deleted_at__isnull=True)
          .select_related('media')
          .order_by('sort_order', 'id'))
    return JsonResponse({'attachments': [presenters.serialize_attachment(a) for a in qs]})


@staff_member_required
@require_POST
def entity_attach(request, attachable_type, attachable_id):
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)

    data = _body(request)
    media_ids = data.get('media_ids') or []
    role = data.get('role', 'gallery')
    if role not in _VALID_ROLES:
        return JsonResponse({'error': 'Unknown role'}, status=400)

    live_ids = set(_live_assets().filter(id__in=media_ids).values_list('id', flat=True))
    missing = [m for m in media_ids if m not in live_ids]
    if missing:
        return JsonResponse({'error': f'Unknown or deleted media: {missing}'}, status=400)

    # For a single-slot role like 'primary', replace any existing primary.
    if role == 'primary':
        MediaAttachment.objects.filter(
            attachable_type=attachable_type, attachable_id=attachable_id, role='primary',
        ).exclude(media_id__in=media_ids).delete()

    base = (MediaAttachment.objects
            .filter(attachable_type=attachable_type, attachable_id=attachable_id, role=role)
            .order_by('-sort_order').values_list('sort_order', flat=True).first()) or 0

    created = []
    for offset, mid in enumerate(media_ids, start=1):
        att, was_created = MediaAttachment.objects.get_or_create(
            media_id=mid, attachable_type=attachable_type,
            attachable_id=attachable_id, role=role,
            defaults={'sort_order': base + offset},
        )
        created.append(presenters.serialize_attachment(att))

    _sync_legacy(attachable_type, attachable_id, role)  # PHASE 7 BRIDGE — remove at cutover

    return JsonResponse({'attachments': created})


@staff_member_required
@require_POST
def entity_reorder(request, attachable_type, attachable_id):
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    data = _body(request)
    order = data.get('order') or []  # list of attachment ids in the new order
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

    # PHASE 7 BRIDGE — keep legacy row ordering in step; remove at cutover.
    for r in {a.role for a in lookup.values()}:
        _sync_legacy(attachable_type, attachable_id, r)

    return JsonResponse({'ok': True, 'updated': len(to_update)})


@staff_member_required
@require_POST
def entity_detach(request, attachable_type, attachable_id):
    """Detach media from an entity. Never deletes the underlying asset."""
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    data = _body(request)
    qs = MediaAttachment.objects.filter(
        attachable_type=attachable_type, attachable_id=attachable_id,
    )
    if 'attachment_id' in data:
        qs = qs.filter(id=data['attachment_id'])
    elif 'media_id' in data:
        qs = qs.filter(media_id=data['media_id'])
        if data.get('role'):
            qs = qs.filter(role=data['role'])
    else:
        return JsonResponse({'error': 'attachment_id or media_id required'}, status=400)

    affected_roles = set(qs.values_list('role', flat=True))  # capture before delete
    deleted, _ = qs.delete()

    # PHASE 7 BRIDGE — clear the corresponding legacy field(s); remove at cutover.
    for r in affected_roles:
        _sync_legacy(attachable_type, attachable_id, r)

    return JsonResponse({'ok': True, 'detached': deleted})
