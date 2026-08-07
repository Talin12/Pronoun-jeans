"""
Plain-dict serialisation for the media library admin API.

No DRF: the picker only ever runs inside the Django admin session, so these are
just functions that turn model instances into JSON-able dicts, plus helpers to
build Cloudinary thumbnail URLs and human labels for usage listings.
"""

import cloudinary.utils

from .models import MediaAttachment


def thumb_url(asset, width=200):
    """A small transform URL for grids — from the stored recipe, else built live."""
    key = str(width)
    if asset.variants and key in asset.variants:
        return asset.variants[key]
    url, _ = cloudinary.utils.cloudinary_url(
        asset.storage_key, width=width, crop='limit',
        fetch_format='auto', quality='auto', secure=True,
    )
    return url


def full_url(asset):
    if asset.variants and 'original' in asset.variants:
        return asset.variants['original']
    url, _ = cloudinary.utils.cloudinary_url(asset.storage_key, secure=True)
    return url


def serialize_asset(asset, *, with_usage=False):
    data = {
        'id':                asset.id,
        'storage_key':       asset.storage_key,
        'thumb_url':         thumb_url(asset, 200),
        'preview_url':       thumb_url(asset, 400),
        'url':               full_url(asset),
        'original_filename': asset.original_filename,
        'mime_type':         asset.mime_type,
        'width':             asset.width,
        'height':            asset.height,
        'file_size':         asset.file_size,
        'alt_text':          asset.alt_text,
        'title':             asset.title,
        'tags':              asset.tags or [],
        'folder':            asset.folder or '',
        'created_at':        asset.created_at.isoformat() if asset.created_at else None,
    }
    if with_usage:
        data['usage_count'] = asset.attachments.count()
    return data


def serialize_attachment(att):
    return {
        'id':          att.id,
        'media':       serialize_asset(att.media),
        'role':        att.role,
        'sort_order':  att.sort_order,
    }


# ── Human labels for the usage panel ──────────────────────────────────────────

def _product_labels(ids):
    from products.models import Product
    return {p.id: p.name for p in Product.objects.filter(id__in=ids)}


def _category_labels(ids):
    from products.models import Category
    return {c.id: str(c) for c in Category.objects.filter(id__in=ids)}


def _variation_labels(ids):
    from products.models import ProductVariation
    return {v.id: f'{v.sku}' for v in ProductVariation.objects.filter(id__in=ids)}


def _product_color_labels(ids):
    from products.models import ProductColorImage
    return {r.id: str(r) for r in ProductColorImage.objects.filter(id__in=ids)}


def _banner_labels(ids):
    from products.models import HeroSlide
    return {h.id: (h.caption or f'Hero slide #{h.id}') for h in HeroSlide.objects.filter(id__in=ids)}


_LABELERS = {
    'product':       _product_labels,
    'category':      _category_labels,
    'variation':     _variation_labels,
    'product_color': _product_color_labels,
    'banner':        _banner_labels,
}


def usage_for(asset):
    """
    Return every place an asset is used, with a human label:
    [{attachment_id, type, id, role, label}, ...].
    """
    attachments = list(asset.attachments.all())

    # Batch-resolve labels per type to avoid N+1.
    by_type = {}
    for att in attachments:
        by_type.setdefault(att.attachable_type, set()).add(att.attachable_id)

    labels = {}
    for atype, ids in by_type.items():
        labeler = _LABELERS.get(atype)
        labels[atype] = labeler(ids) if labeler else {}

    rows = []
    for att in attachments:
        label = labels.get(att.attachable_type, {}).get(att.attachable_id) \
            or f'{att.attachable_type} #{att.attachable_id}'
        rows.append({
            'attachment_id': att.id,
            'type':          att.attachable_type,
            'id':            att.attachable_id,
            'role':          att.role,
            'label':         label,
        })
    return rows
