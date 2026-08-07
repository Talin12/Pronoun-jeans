from django.contrib import admin
from django.utils.html import format_html

from .models import MediaAsset, MediaAttachment


class MediaAttachmentInline(admin.TabularInline):
    model           = MediaAttachment
    extra           = 0
    fields          = ['attachable_type', 'attachable_id', 'role', 'sort_order', 'created_at']
    readonly_fields = ['created_at']


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display   = ['preview', '__str__', 'mime_type', 'usage_count', 'created_at', 'deleted_at']
    list_display_links = ['preview', '__str__']
    search_fields  = ['original_filename', 'title', 'alt_text', 'storage_key', 'file_hash']
    list_filter    = ['mime_type', 'folder', 'deleted_at']
    readonly_fields = [
        'storage_key', 'file_hash', 'mime_type', 'width', 'height',
        'file_size', 'variants', 'uploaded_by', 'created_at', 'updated_at',
    ]
    inlines        = [MediaAttachmentInline]

    def preview(self, obj):
        # storage_key is the Cloudinary public_id; a small on-the-fly thumbnail.
        if obj.storage_key:
            return format_html(
                '<img src="{}" style="height:40px;border-radius:4px;object-fit:cover;" />',
                obj.storage_key if obj.storage_key.startswith('http') else '',
            )
        return '—'
    preview.short_description = 'Preview'

    def usage_count(self, obj):
        return obj.attachments.count()
    usage_count.short_description = 'Used in'


@admin.register(MediaAttachment)
class MediaAttachmentAdmin(admin.ModelAdmin):
    list_display   = ['media', 'attachable_type', 'attachable_id', 'role', 'sort_order']
    list_filter    = ['attachable_type', 'role']
    search_fields  = ['media__original_filename', 'media__title']
