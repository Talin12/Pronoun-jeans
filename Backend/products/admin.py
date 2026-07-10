from django import forms
from django.contrib import admin, messages
from django.contrib.admin import AdminSite
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.text import slugify

from .models import (
    Category, Product, ProductImage, ProductVariation, VariationImage,
    Color, HeroSlide, SizeSet, SizeSetBreakdown,
)


def _unique_slug(base_slug):
    slug    = base_slug
    counter = 2
    while Product.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def _unique_sku(base_sku):
    sku     = base_sku
    counter = 2
    while ProductVariation.objects.filter(sku=sku).exists():
        sku = f"{base_sku}-{counter}"
        counter += 1
    return sku


# ── Hero Slides ───────────────────────────────────────────────────────────────

@admin.register(HeroSlide)
class HeroSlideAdmin(admin.ModelAdmin):
    list_display  = ['__str__', 'order', 'is_active', 'preview']
    list_editable = ['order', 'is_active']
    ordering      = ['order', 'id']

    def preview(self, obj):
        from django.utils.html import format_html
        if obj.image:
            return format_html(
                '<img src="{}" style="height:48px;border-radius:6px;object-fit:cover;" />',
                obj.image.url,
            )
        return '—'
    preview.short_description = 'Preview'


# ── Size Set Admin ────────────────────────────────────────────────────────────

class SizeSetBreakdownInline(admin.TabularInline):
    """
    Without Jazzmin, Django renders inlines directly on the same page —
    no tabs, no separation. This inline appears right below the SizeSet
    fields on the same page, exactly as intended.
    """
    model   = SizeSetBreakdown
    extra   = 1
    fields  = ['label', 'breakdown_string']


@admin.register(SizeSet)
class SizeSetAdmin(admin.ModelAdmin):
    list_display  = ['name', 'is_active', 'order', 'breakdown_count']
    list_editable = ['is_active', 'order']
    ordering      = ['order', 'name']
    inlines       = [SizeSetBreakdownInline]

    def breakdown_count(self, obj):
        return obj.breakdowns.count()
    breakdown_count.short_description = 'Breakdowns'

    class Media:
        js = ('admin/js/set_breakdown_builder.js',)


# ── Variation Form ────────────────────────────────────────────────────────────

class ProductVariationForm(forms.ModelForm):
    class Meta:
        model  = ProductVariation
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        instance = kwargs.get('instance')
        if instance and instance.size_set_id:
            self.fields['size_breakdown'].queryset = (
                SizeSetBreakdown.objects.filter(size_set_id=instance.size_set_id)
            )
        else:
            self.fields['size_breakdown'].queryset = (
                SizeSetBreakdown.objects.select_related('size_set').all()
            )

        self.fields['size_set'].queryset = SizeSet.objects.filter(is_active=True)
        self.fields['size_set'].widget.attrs.update({'style': 'min-width:140px;'})
        self.fields['size_breakdown'].widget.attrs.update({'style': 'min-width:200px;'})


# ── Inlines ───────────────────────────────────────────────────────────────────

class ProductImageInline(admin.TabularInline):
    model    = ProductImage
    extra    = 0
    fields   = ['image', 'alt_text', 'order']
    ordering = ['order']


class ProductVariationInline(admin.TabularInline):
    model  = ProductVariation
    form   = ProductVariationForm
    extra  = 0
    fields = [
        'size_set',
        'color_palette',
        'sku',
        'b2b_price',
        'size_breakdown',
        'per_piece_price',
        'mrp',
        'mrp_per_piece',
        'stock_quantity',
        'image',
        'color',
        'variation_images_widget',
    ]
    readonly_fields = ['color', 'variation_images_widget']

    def variation_images_widget(self, obj):
        from django.utils.html import mark_safe
        from django.urls import reverse

        if not obj.pk:
            return mark_safe(
                '<span style="color:#999;font-size:12px;">Save variation first to add images.</span>'
            )

        upload_url = reverse('admin:variation_upload_images', args=[obj.pk])
        images     = obj.gallery_images.all()

        parts = [
            f'<div class="var-img-widget" data-variation-id="{obj.pk}" '
            f'data-upload-url="{upload_url}" '
            f'style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:180px;">'
            f'<div class="var-thumbs" style="display:flex;flex-wrap:wrap;gap:6px;">'
        ]
        for img in images:
            delete_url = reverse('admin:variation_delete_image', args=[obj.pk, img.pk])
            parts.append(
                f'<div class="var-thumb" data-image-id="{img.pk}" '
                f'style="position:relative;display:inline-block;">'
                f'<img src="{img.image.url}" '
                f'style="height:48px;width:48px;object-fit:cover;border-radius:4px;">'
                f'<button type="button" class="var-thumb-del" data-url="{delete_url}" '
                f'style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;'
                f'border:none;border-radius:50%;width:16px;height:16px;cursor:pointer;'
                f'font-size:10px;line-height:1;padding:0;">&times;</button>'
                f'</div>'
            )
        parts.append(
            '</div>'
            '<label style="cursor:pointer;font-size:12px;white-space:nowrap;color:#417690;">'
            '+ Add images'
            '<input type="file" multiple accept="image/*" class="var-img-picker" style="display:none;">'
            '</label>'
            '</div>'
        )
        return mark_safe(''.join(parts))

    variation_images_widget.short_description = 'Images'

    class Media:
        js = ('admin/js/set_breakdown_builder.js', 'admin/js/variation_inline_images.js')


# ── Clone action ──────────────────────────────────────────────────────────────

@admin.action(description='Duplicate selected product(s)')
def clone_products(modeladmin, request, queryset):
    original_pks = list(queryset.values_list('pk', flat=True))
    cloned_ids   = []

    for pk in original_pks:
        try:
            source = Product.objects.prefetch_related(
                'variations__color_palette', 'gallery_images'
            ).get(pk=pk)
        except Product.DoesNotExist:
            continue

        new_name = f"{source.name} (Copy)"
        new_slug = _unique_slug(slugify(new_name))

        clone                = Product()
        clone.name           = new_name
        clone.slug           = new_slug
        clone.category       = source.category
        clone.description    = source.description
        clone.fabric_details = source.fabric_details
        clone.is_active      = False
        clone.moq            = source.moq
        clone.image          = source.image
        clone.save()

        for v in source.variations.all():
            nv                 = ProductVariation()
            nv.product         = clone
            nv.size_set        = v.size_set
            nv.size_breakdown  = v.size_breakdown
            nv.color           = v.color
            nv.color_palette   = v.color_palette
            nv.sku             = _unique_sku(f"{v.sku}-copy")
            nv.b2b_price       = v.b2b_price
            nv.per_piece_price = v.per_piece_price
            nv.mrp             = v.mrp
            nv.mrp_per_piece   = v.mrp_per_piece
            nv.stock_quantity  = v.stock_quantity
            nv.image           = v.image
            nv.save()

        for img in source.gallery_images.all():
            ni          = ProductImage()
            ni.product  = clone
            ni.image    = img.image
            ni.alt_text = img.alt_text
            ni.order    = img.order
            ni.save()

        cloned_ids.append(clone.pk)

    count = len(cloned_ids)
    if count == 0:
        modeladmin.message_user(request, 'No products were cloned.', messages.WARNING)
        return
    if count == 1:
        edit_url = reverse('admin:products_product_change', args=[cloned_ids[0]])
        modeladmin.message_user(
            request,
            f'Product cloned (ID: {cloned_ids[0]}). Clone is inactive — review and publish when ready.',
            messages.SUCCESS,
        )
        return HttpResponseRedirect(edit_url)
    modeladmin.message_user(
        request,
        f'{count} products cloned (IDs: {", ".join(str(i) for i in cloned_ids)}). All clones start as inactive.',
        messages.SUCCESS,
    )


# ── Other Admin Registrations ─────────────────────────────────────────────────

@admin.register(Color)
class ColorAdmin(admin.ModelAdmin):
    list_display  = ['name', 'hex_code', 'swatch']
    search_fields = ['name']
    ordering      = ['name']

    def swatch(self, obj):
        from django.utils.html import format_html
        return format_html(
            '<span style="display:inline-block;width:24px;height:24px;'
            'border-radius:50%;background:{};border:1px solid #ccc;"></span>',
            obj.hex_code,
        )
    swatch.short_description = 'Color'


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display        = ['name', 'slug']
    search_fields       = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display  = ['product', 'alt_text', 'order']
    list_filter   = ['product']
    search_fields = ['product__name', 'alt_text']
    ordering      = ['product', 'order']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display        = ['name', 'category', 'is_active', 'moq', 'created_at']
    list_filter         = ['is_active', 'category']
    search_fields       = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
    ordering            = ['-created_at']
    actions             = [clone_products]
    inlines             = [ProductImageInline, ProductVariationInline]

    fieldsets = (
        ('Product Info', {
            'fields': ('name', 'slug', 'category', 'description', 'fabric_details', 'is_active', 'moq'),
        }),
        ('Media', {
            'fields': ('image',),
        }),
    )


class VariationImageInline(admin.TabularInline):
    model    = VariationImage
    extra    = 0
    fields   = ['image', 'alt_text', 'order']
    ordering = ['order']

    class Media:
        js = ('admin/js/variation_image_multi_upload.js',)


@admin.register(ProductVariation)
class ProductVariationAdmin(admin.ModelAdmin):
    form          = ProductVariationForm
    list_display  = ['sku', 'product', 'size_set', 'color', 'b2b_price', 'per_piece_price', 'mrp', 'mrp_per_piece', 'stock_quantity']
    list_filter   = ['product__category', 'size_set']
    search_fields = ['sku', 'product__name', 'color']
    ordering      = ['product', 'size_set__name']
    inlines       = [VariationImageInline]

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:variation_id>/upload-images/',
                self.admin_site.admin_view(self._upload_images),
                name='variation_upload_images',
            ),
            path(
                '<int:variation_id>/delete-image/<int:image_id>/',
                self.admin_site.admin_view(self._delete_image),
                name='variation_delete_image',
            ),
        ]
        return custom_urls + urls

    def _upload_images(self, request, variation_id):
        from django.core.exceptions import ValidationError
        from django.http import JsonResponse

        from core.utils.images import validate_image_upload

        if request.method != 'POST':
            return JsonResponse({'error': 'POST only'}, status=405)
        try:
            variation = ProductVariation.objects.get(pk=variation_id)
        except ProductVariation.DoesNotExist:
            return JsonResponse({'error': 'Not found'}, status=404)
        files   = request.FILES.getlist('images')
        created = []
        errors  = []
        for f in files:
            try:
                validate_image_upload(f)
                img = VariationImage.objects.create(variation=variation, image=f)
            except ValidationError as e:
                errors.append(f'{f.name}: {e.messages[0]}')
            except Exception:
                errors.append(f'{f.name}: upload failed, please try again.')
            else:
                created.append({'id': img.pk, 'url': img.image.url})
        return JsonResponse({'images': created, 'errors': errors})

    def _delete_image(self, request, variation_id, image_id):
        from django.http import JsonResponse
        if request.method != 'POST':
            return JsonResponse({'error': 'POST only'}, status=405)
        try:
            img = VariationImage.objects.get(pk=image_id, variation_id=variation_id)
        except VariationImage.DoesNotExist:
            return JsonResponse({'error': 'Not found'}, status=404)
        img.delete()
        return JsonResponse({'ok': True})