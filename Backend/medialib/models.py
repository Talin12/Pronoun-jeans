"""
Centralised media library.

The problem this solves: today the same image file is re-uploaded every time
it is needed (a product in a second category, a banner, a variation gallery),
so Cloudinary ends up storing many byte-identical copies and the admin wastes
time re-uploading. Here an image is uploaded ONCE (deduplicated by content
hash), stored once, and then REFERENCED anywhere via MediaAttachment.

Phase 1 is purely additive — the existing image columns on Category, Product,
ProductImage, ProductColorImage, ProductVariation, VariationImage and HeroSlide
are left completely untouched and keep working exactly as before.
"""

from django.conf import settings
from django.db import models


# Human-facing keys used in the polymorphic attachment + in the API routes
# (/api/<type>/<id>/media/). Kept as plain strings rather than Django's
# ContentType framework so the API URLs stay clean and stable even if models
# move between apps.
ATTACHABLE_TYPES = [
    ('product',       'Product'),
    ('product_color', 'Product colour'),
    ('variation',     'Product variation'),
    ('category',      'Category'),
    ('banner',        'Hero slide / banner'),
    ('lookbook',      'Lookbook'),
]

ROLE_CHOICES = [
    ('primary', 'Primary'),
    ('gallery', 'Gallery'),
    ('swatch',  'Swatch'),
]


class MediaAsset(models.Model):
    """
    One physical image, stored once on Cloudinary and referenced everywhere.

    `file_hash` (SHA-256 of the *stored* bytes, i.e. after CompressedImageField
    has re-encoded the upload) is the deduplication key: an upload whose hash
    already exists returns the existing asset instead of writing a second copy.
    """

    # Cloudinary public_id / storage path. This IS the identity we key on for
    # the file on Cloudinary — no re-upload needed to reuse it.
    storage_key       = models.CharField(max_length=500, unique=True)

    # SHA-256 hex digest of the stored bytes. The dedup key.
    file_hash         = models.CharField(max_length=64, unique=True, db_index=True)

    original_filename = models.CharField(max_length=500, blank=True)
    mime_type         = models.CharField(max_length=100, blank=True)
    width             = models.PositiveIntegerField(null=True, blank=True)
    height            = models.PositiveIntegerField(null=True, blank=True)
    file_size         = models.BigIntegerField(null=True, blank=True, help_text='Bytes')

    # Set ONCE per asset and reused at every placement — this is the direct SEO
    # win: edit alt text on the asset, not per-placement.
    alt_text          = models.TextField(blank=True)
    title             = models.CharField(max_length=255, blank=True)
    tags              = models.JSONField(default=list, blank=True)
    folder            = models.CharField(max_length=255, blank=True, null=True)

    # Cloudinary transform recipes/URLs (w_/f_auto/q_auto). NOT stored derivative
    # files — Cloudinary generates them on first request, so this is instant.
    variants          = models.JSONField(default=dict, blank=True)

    uploaded_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='uploaded_media',
    )

    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    # Soft delete only — a physical Cloudinary purge is always a separate,
    # explicit, manual step (see the data-migration / cutover phases).
    deleted_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering            = ['-created_at', '-id']
        verbose_name        = 'Media Asset'
        verbose_name_plural = 'Media Library'

    def __str__(self):
        return self.title or self.original_filename or self.storage_key


class MediaAttachment(models.Model):
    """
    A reference from any entity (product, category, banner, …) to a MediaAsset.

    Polymorphic via (attachable_type, attachable_id) so the same asset can be
    attached to a product AND a banner AND a category without ever duplicating
    the underlying file.
    """

    media           = models.ForeignKey(
        MediaAsset, on_delete=models.PROTECT, related_name='attachments',
    )
    attachable_type = models.CharField(max_length=32, choices=ATTACHABLE_TYPES)
    attachable_id   = models.BigIntegerField()
    role            = models.CharField(max_length=16, choices=ROLE_CHOICES, default='gallery')
    sort_order      = models.PositiveIntegerField(default=0)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['media', 'attachable_type', 'attachable_id', 'role'],
                name='uniq_media_attachment_role',
            ),
        ]
        indexes = [
            # The hot read path: "give me the ordered images for this entity".
            models.Index(
                fields=['attachable_type', 'attachable_id', 'sort_order'],
                name='idx_attach_entity_order',
            ),
        ]
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.attachable_type}#{self.attachable_id} → {self.media} ({self.role})'
