from decimal import Decimal, ROUND_HALF_UP
from django.core.exceptions import ValidationError
from django.db import models

from core.utils.images import CompressedImageField


class Category(models.Model):
    name   = models.CharField(max_length=255)
    slug   = models.SlugField(unique=True, max_length=255)
    image  = CompressedImageField(upload_to='categories/', null=True, blank=True)
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='subcategories',
        help_text='Leave blank for a main category. Set this to nest it as a sub-category.',
    )

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return f"{self.parent.name} → {self.name}" if self.parent_id else self.name

    def clean(self):
        if self.parent_id:
            if self.pk and self.parent_id == self.pk:
                raise ValidationError({'parent': 'A category cannot be its own parent.'})
            if self.parent.parent_id:
                raise ValidationError({'parent': 'Only one level of sub-categories is supported.'})


class HeroSlide(models.Model):
    image     = CompressedImageField(upload_to='hero_slides/')
    caption   = models.CharField(max_length=255, blank=True)
    order     = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering            = ['order', 'id']
        verbose_name        = 'Hero Slide'
        verbose_name_plural = 'Hero Slides'

    def __str__(self):
        return self.caption or f"Slide #{self.pk}"


class Product(models.Model):
    category       = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name="products")
    subcategories  = models.ManyToManyField(
        Category, blank=True, related_name='products_in_subcategory',
        limit_choices_to={'parent__isnull': False},
        help_text='Sub-categories (within the selected category) this product should also appear under.',
    )
    name           = models.CharField(max_length=255)
    slug           = models.SlugField(unique=True, max_length=255)
    description    = models.TextField(blank=True)
    fabric_details = models.TextField(blank=True, null=True)
    is_active      = models.BooleanField(default=True)
    moq            = models.PositiveIntegerField(default=10)
    image          = CompressedImageField(upload_to='products/', blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product  = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='gallery_images')
    image    = CompressedImageField(upload_to='products/gallery/')
    alt_text = models.CharField(max_length=255, blank=True)
    order    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Gallery image for {self.product.name} (#{self.pk})"


class Color(models.Model):
    name     = models.CharField(max_length=100, unique=True)
    hex_code = models.CharField(max_length=7, default='#CCCCCC')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.hex_code})"


# ── Size Sets ─────────────────────────────────────────────────────────────────

class SizeSet(models.Model):
    """
    A named size set the admin creates, e.g. 'L TO 3XL', 'M TO 4XL'.
    This replaces the hardcoded SIZE_CHOICES on ProductVariation.
    The name becomes the value shown in the Size dropdown on the variation
    inline and is what the API returns as the 'size' string.
    """
    name      = models.CharField(max_length=50, unique=True,
                                 help_text='e.g. "L TO 3XL" or "M TO 4XL"')
    is_active = models.BooleanField(default=True,
                                    help_text='Inactive sets are hidden from the variation dropdown.')
    order     = models.PositiveSmallIntegerField(default=0,
                                                 help_text='Controls display order in the dropdown.')

    class Meta:
        ordering     = ['order', 'name']
        verbose_name = 'Size Set'
        verbose_name_plural = 'Size Sets'

    def __str__(self):
        return self.name


class SizeSetBreakdown(models.Model):
    """
    A reusable breakdown option for a SizeSet.
    e.g. for 'L TO 3XL':
        label            = '1xL, 1xXL, 1xXXL, 1x3XL'
        breakdown_string = '1xL, 1xXL, 1xXXL, 1x3XL'
    Multiple breakdowns can exist per SizeSet so the admin can pick
    the right distribution for each product variation.
    """
    size_set         = models.ForeignKey(SizeSet, on_delete=models.CASCADE,
                                         related_name='breakdowns')
    label            = models.CharField(max_length=255,
                                        help_text='Human-readable label shown in the dropdown, '
                                                  'e.g. "1xL, 2xXL, 1xXXL, 1x3XL"')
    breakdown_string = models.CharField(max_length=255,
                                        help_text='Exact string stored on the variation and '
                                                  'shown to buyers in the tooltip. '
                                                  'Usually the same as the label.')

    class Meta:
        unique_together     = ('size_set', 'breakdown_string')
        ordering            = ['size_set__name', 'label']
        verbose_name        = 'Size Set Breakdown'
        verbose_name_plural = 'Size Set Breakdowns'

    def __str__(self):
        return f"{self.size_set.name} — {self.label}"


# ── Product Variation ─────────────────────────────────────────────────────────

class ProductVariation(models.Model):

    product       = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variations")

    # size is now a FK to SizeSet — the admin picks from dynamically created sets.
    # SET_NULL so deleting a SizeSet doesn't cascade-delete variations;
    # the admin should deactivate sets instead.
    size_set      = models.ForeignKey(
        SizeSet, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='variations',
        verbose_name='Size',
    )

    # set_breakdown is now a FK to SizeSetBreakdown — nullable because
    # not every variation needs a breakdown (e.g. if only one breakdown exists).
    size_breakdown = models.ForeignKey(
        SizeSetBreakdown, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='variations',
        verbose_name='Set Breakdown',
    )

    color         = models.CharField(max_length=100, blank=True, null=True)
    color_palette = models.ForeignKey(
        Color, on_delete=models.SET_NULL, null=True, blank=True, related_name='variations'
    )
    sku           = models.CharField(max_length=100, unique=True)

    b2b_price       = models.DecimalField(max_digits=10, decimal_places=2)
    per_piece_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    mrp             = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    mrp_per_piece   = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    stock_quantity  = models.PositiveIntegerField(default=0)
    image           = CompressedImageField(upload_to='variations/', null=True, blank=True)

    class Meta:
        # unique_together now uses size_set instead of size string
        unique_together = ("product", "size_set", "color")
        verbose_name    = "Product Variation"

    def save(self, *args, **kwargs):
        for field in ('b2b_price', 'per_piece_price', 'mrp', 'mrp_per_piece'):
            val = getattr(self, field)
            if val is not None and not isinstance(val, Decimal):
                setattr(self, field,
                        Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

        if self.color_palette_id:
            palette = self.__dict__.get('color_palette')
            if palette is not None:
                self.color = palette.name
            else:
                color_name = Color.objects.filter(
                    pk=self.color_palette_id
                ).values_list('name', flat=True).first()
                if color_name:
                    self.color = color_name

        super().save(*args, **kwargs)

    # ── Convenience properties used by serializer ─────────────────────────────

    @property
    def size(self):
        """Returns the size name string, e.g. 'L TO 3XL'. API-compatible."""
        return self.size_set.name if self.size_set else ''

    @property
    def set_breakdown(self):
        """Returns the breakdown string, e.g. '1xL, 1xXL, 1xXXL, 1x3XL'."""
        return self.size_breakdown.breakdown_string if self.size_breakdown else ''

    def __str__(self):
        product_name = (
            self.__dict__['product'].name
            if 'product' in self.__dict__
            else f"SKU {self.sku}"
        )

        return f"{product_name} | {self.size} | {self.color or '—'}"


class VariationImage(models.Model):
    variation = models.ForeignKey(ProductVariation, on_delete=models.CASCADE, related_name='gallery_images')
    image     = CompressedImageField(upload_to='variations/gallery/')
    alt_text  = models.CharField(max_length=255, blank=True)
    order     = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Image for {self.variation} (#{self.pk})"