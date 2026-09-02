"""
Admin-gated JSON API for the media library picker.

Deliberately NOT DRF: the picker only ever runs inside the Django admin session,
so these are plain staff-gated views returning JsonResponse — the same pattern
the existing `variation_upload_images` admin view uses. Auth + CSRF come from the
admin session; the picker JS sends the csrftoken cookie back as X-CSRFToken.
"""

import json

from django.contrib.admin.views.decorators import staff_member_required
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from . import presenters, services
from .models import ATTACHABLE_TYPES, ROLE_CHOICES, MediaAsset

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
    # 'categories' is prefetched because serialize_asset lists an asset's
    # library sections — without it the grid would issue a query per image.
    return MediaAsset.objects.filter(deleted_at__isnull=True).prefetch_related('categories')


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
    try:
        detached = services.soft_delete_asset(asset, force=force)
    except services.AssetInUse as exc:
        return JsonResponse(
            {'error': str(exc), 'usage_count': exc.usage_count}, status=409,
        )
    return JsonResponse({'ok': True, 'detached': detached})


# ── Attachment endpoints ──────────────────────────────────────────────────────
#
# The attach/detach/reorder mutation logic (and the Phase 7 legacy-column bridge)
# lives in medialib.services so the JWT admin API can reuse it. These views are
# thin: session auth + request parsing + JSON shaping only.

def _valid_entity(attachable_type):
    return attachable_type in _VALID_TYPES


@staff_member_required
@require_GET
def entity_attachments(request, attachable_type, attachable_id):
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    role = request.GET.get('role')
    if role and role not in _VALID_ROLES:
        return JsonResponse({'error': 'Unknown role'}, status=400)
    qs = services.list_attachments(attachable_type, attachable_id, role=role)
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

    try:
        created = services.attach_assets(attachable_type, attachable_id, media_ids, role)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'attachments': [presenters.serialize_attachment(a) for a in created]})


@staff_member_required
@require_POST
def entity_reorder(request, attachable_type, attachable_id):
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    data = _body(request)
    updated = services.reorder_assets(attachable_type, attachable_id, data.get('order') or [])
    return JsonResponse({'ok': True, 'updated': updated})


@staff_member_required
@require_POST
def entity_detach(request, attachable_type, attachable_id):
    """Detach media from an entity. Never deletes the underlying asset."""
    if not _valid_entity(attachable_type):
        return JsonResponse({'error': 'Unknown type'}, status=400)
    data = _body(request)
    try:
        deleted = services.detach_assets(
            attachable_type, attachable_id,
            attachment_id=data.get('attachment_id'),
            media_id=data.get('media_id'),
            role=data.get('role'),
        )
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'ok': True, 'detached': deleted})
