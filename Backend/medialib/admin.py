from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html, format_html_join
from django.utils.safestring import mark_safe

from . import presenters
from .models import MediaAsset, MediaAttachment


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    """
    Browsable image library: a thumbnail-forward list with search + usage counts.

    Assets are created via the picker's Upload tab (with dedup) or the backfill —
    never by hand here — so 'Add' is disabled. The change page lets you edit the
    human/SEO fields (alt text, title, tags) and shows a read-only 'Used in' panel
    instead of the raw attachment table.
    """
    list_display       = ['thumb', 'label', 'used_in', 'dimensions', 'created_at']
    list_display_links = ['thumb', 'label']
    search_fields      = ['original_filename', 'title', 'alt_text', 'storage_key', 'tags']
    list_filter        = ['mime_type', 'folder']
    ordering           = ['-created_at']
    list_per_page      = 60

    fieldsets = (
        (None,               {'fields': ('big_preview',)}),
        ('Details (editable)', {
            'fields': ('alt_text', 'title', 'tags', 'folder'),
            'description': 'Alt text is set once here and reused everywhere this image '
                           'appears — a direct SEO benefit.',
        }),
        ('Used in',          {'fields': ('used_in_detail',)}),
        ('Technical (read-only)', {
            'classes': ('collapse',),
            'fields': ('storage_key', 'file_hash', 'mime_type', 'dimensions',
                       'file_size', 'uploaded_by', 'created_at', 'updated_at'),
        }),
    )
    readonly_fields = ['big_preview', 'used_in_detail', 'storage_key', 'file_hash',
                       'mime_type', 'dimensions', 'file_size', 'uploaded_by',
                       'created_at', 'updated_at']

    def get_queryset(self, request):
        # Live assets only; annotate usage once to avoid an N+1 in the list.
        return (super().get_queryset(request)
                .filter(deleted_at__isnull=True)
                .annotate(_use=Count('attachments')))

    # ── list columns ──────────────────────────────────────────────────────────
    def thumb(self, obj):
        return format_html(
            '<img src="{}" loading="lazy" '
            'style="height:64px;width:64px;object-fit:cover;border-radius:6px;'
            'background:#f2f2f2;border:1px solid #e3e3e3;">',
            presenters.thumb_url(obj, 200),
        )
    thumb.short_description = ''

    def label(self, obj):
        name = obj.title or obj.original_filename or obj.storage_key
        alt_note = '' if obj.alt_text else mark_safe(
            ' · <span style="color:#e67e22;">no alt text</span>')
        return format_html('<b>{}</b><br><small style="color:#888;">{}{}</small>',
                           name, obj.mime_type or '', alt_note)
    label.short_description = 'Image'

    def used_in(self, obj):
        n = getattr(obj, '_use', None)
        if n is None:
            n = obj.attachments.count()
        return format_html('<b>{}</b> place{}', n, '' if n == 1 else 's')
    used_in.short_description = 'Used in'
    used_in.admin_order_field = '_use'

    def dimensions(self, obj):
        return f'{obj.width}×{obj.height}' if obj.width and obj.height else '—'
    dimensions.short_description = 'Dimensions'

    # ── change page ─────────────────────────────────────────────────────────────
    def big_preview(self, obj):
        if not obj or not obj.storage_key:
            return '—'
        return format_html(
            '<img src="{}" style="max-width:340px;max-height:340px;border-radius:10px;'
            'border:1px solid #ddd;">',
            presenters.thumb_url(obj, 400),
        )
    big_preview.short_description = 'Preview'

    def used_in_detail(self, obj):
        if not obj or not obj.pk:
            return '—'
        rows = presenters.usage_for(obj)
        if not rows:
            return mark_safe('<span style="color:#888;">Not used anywhere yet.</span>')
        return format_html(
            '<ul style="margin:0;padding-left:18px;">{}</ul>',
            format_html_join(
                '',
                '<li><b>{}</b> — {} <small style="color:#888;">({} #{})</small></li>',
                ((r['label'], r['role'], r['type'], r['id']) for r in rows),
            ),
        )
    used_in_detail.short_description = 'Used in'

    def has_add_permission(self, request):
        # Images enter the library via the picker upload (dedup) or the backfill,
        # not by hand — a manual asset with no real file/hash would be meaningless.
        return False


@admin.register(MediaAttachment)
class MediaAttachmentAdmin(admin.ModelAdmin):
    """Read-only view of where images are attached. Managed by the picker, not here."""
    list_display   = ['media', 'attachable_type', 'attachable_id', 'role', 'sort_order']
    list_filter    = ['attachable_type', 'role']
    search_fields  = ['media__original_filename', 'media__title']
    ordering       = ['attachable_type', 'attachable_id', 'sort_order']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
