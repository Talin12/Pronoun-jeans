from decimal import Decimal, ROUND_HALF_UP
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from core.utils.images import CompressedImageField

# Field lengths that mirror what search engines actually render, so the admin
# panel's character counters and the database agree on the limit.
META_TITLE_MAX = 70
META_DESCRIPTION_MAX = 160
ALT_TEXT_MAX = 255


def default_alt_text(product):
    """
    The alt text an image gets when nobody typed one.

    "<Product name> — <Category>" is not inspired, but it is accurate, and it
    beats the alternative: a gallery of images with alt="" that screen readers
    skip silently and search engines cannot read at all.
    """
    category = product.category.name if product.category_id else None
    text = f'{product.name} — {category}' if category else product.name
    return text[:ALT_TEXT_MAX]


class Category(models.Model):
    name   = models.CharField(max_length=255)
    slug   = models.SlugField(unique=True, max_length=255)
    image  = CompressedImageField(upload_to='categories/', null=True, blank=True)
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='subcategories',
        help_text='Leave blank for a main category. Set this to nest it as a sub-category.',
    )
    description = models.TextField(
        blank=True,
        help_text='Used as the meta description on the category page. '
                  'Left blank, one is generated from the category name.',
    )
    updated_at = models.DateTimeField(auto_now=True)

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
    # Short human-assigned code (e.g. "PJ100"). Used as the SKU prefix when
    # building variants, which is otherwise derived from the slug and comes out
    # long and unreadable. Optional, but unique when set — NULL rather than ''
    # for the blanks, so any number of products can be left without one.
    code           = models.CharField(
        max_length=32, unique=True, null=True, blank=True,
        help_text='Short code used as the SKU prefix, e.g. "PJ100". '
                  'Letters, digits and hyphens.',
    )
    slug           = models.SlugField(unique=True, max_length=255)
    description    = models.TextField(blank=True)
    fabric_details = models.TextField(blank=True, null=True)
    is_active      = models.BooleanField(default=True)
    # 1, not 10: most products are sold by the set, so a "minimum" of ten sets
    # was a floor nobody had chosen — it came from the field's original default
    # rather than from any product's actual terms. A product that really does
    # have a minimum sets it explicitly.
    moq            = models.PositiveIntegerField(default=1)
    image          = CompressedImageField(upload_to='products/', blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    # Drives <lastmod> in the sitemap. auto_now, so it cannot drift from
    # reality the way a hand-maintained date would.
    updated_at     = models.DateTimeField(auto_now=True)

    # ── SEO overrides ─────────────────────────────────────────────────────
    # All optional. The storefront generates perfectly serviceable metadata
    # from the name, category, fabric and MOQ; these exist for the products
    # worth writing by hand. Blank means "use the generated one" — never an
    # empty tag.
    meta_title = models.CharField(
        max_length=META_TITLE_MAX, blank=True,
        help_text=f'Overrides the search-result title. Up to {META_TITLE_MAX} characters. '
                  'Blank uses the generated one.',
    )
    meta_description = models.CharField(
        max_length=META_DESCRIPTION_MAX, blank=True,
        help_text=f'Overrides the search-result description. Up to {META_DESCRIPTION_MAX} '
                  'characters. Blank uses the generated one.',
    )
    og_image = CompressedImageField(
        upload_to='products/og/', blank=True, null=True,
        help_text='Image used when the product is shared on WhatsApp or social. '
                  'Blank falls back to the cover image, then the site card.',
    )

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product  = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='gallery_images')
    image    = CompressedImageField(upload_to='products/gallery/')
    alt_text = models.CharField(max_length=255, blank=True)
    order    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def save(self, *args, **kwargs):
        if not self.alt_text:
            self.alt_text = default_alt_text(self.product)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Gallery image for {self.product.name} (#{self.pk})"


class Color(models.Model):
    name     = models.CharField(max_length=100, unique=True)
    hex_code = models.CharField(max_length=7, default='#CCCCCC')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.hex_code})"


class ProductColorImage(models.Model):
    """
    Gallery image for one color of a product, uploaded once and shared by
    every variation of that product+color (e.g. a 3-piece and a 5-piece
    "Beige" set both show the same images instead of needing separate
    per-variation uploads).
    """
    product  = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='color_images')
    color    = models.ForeignKey(Color, on_delete=models.CASCADE, related_name='product_images')
    image    = CompressedImageField(upload_to='products/colors/')
    alt_text = models.CharField(max_length=255, blank=True)
    order    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering            = ['product', 'color', 'order', 'id']
        verbose_name        = 'Product Color Image'
        verbose_name_plural = 'Product Color Images'

    def save(self, *args, **kwargs):
        if not self.alt_text:
            # Colour-specific, since these images differ only by colour and
            # identical alt text across a gallery is barely better than none.
            self.alt_text = f'{default_alt_text(self.product)} — {self.color.name}'[:ALT_TEXT_MAX]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product.name} — {self.color.name} (#{self.pk})"


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
        label            = '1xL, 1xXL, 1x2XL, 1x3XL'
        breakdown_string = '1xL, 1xXL, 1x2XL, 1x3XL'
    Multiple breakdowns can exist per SizeSet so the admin can pick
    the right distribution for each product variation.
    """
    size_set         = models.ForeignKey(SizeSet, on_delete=models.CASCADE,
                                         related_name='breakdowns')
    label            = models.CharField(max_length=255,
                                        help_text='Human-readable label shown in the dropdown, '
                                                  'e.g. "1xL, 2xXL, 1x2XL, 1x3XL"')
    breakdown_string = models.CharField(max_length=255,
                                        help_text='Exact string stored on the variation and '
                                                  'shown to buyers in the tooltip. '
                                                  'Usually the same as the label.')
    pieces           = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text='Total garment pieces in this breakdown, e.g. "1xL, 1xXL, 1x2XL, 1x3XL" = 4. '
                  'Used to auto-calculate a variation\'s total MRP/price from its per-piece price.',
    )

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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Snapshot of the pricing inputs as loaded from the DB (or as
        # initially constructed, for a brand-new instance). save() compares
        # against these to tell whether the admin actually changed a
        # pricing input this time, vs. is just saving an unrelated field
        # (e.g. stock_quantity) on a row that already has a price — see
        # the dirty-check in save() below.
        self._original_per_piece_price   = self.per_piece_price
        self._original_mrp_per_piece     = self.mrp_per_piece
        self._original_size_breakdown_id = self.size_breakdown_id

    def save(self, *args, **kwargs):
        for field in ('b2b_price', 'per_piece_price', 'mrp', 'mrp_per_piece'):
            val = getattr(self, field)
            if val is not None and not isinstance(val, Decimal):
                setattr(self, field,
                        Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

        # Auto-calculate the set totals from the per-piece prices, e.g. a
        # "Set of 3 PCS" breakdown multiplies per-piece price/MRP by 3 —
        # but only when a pricing input actually changed (or this is a
        # brand-new row). Without this guard, saving *any* field (e.g.
        # stock_quantity) would silently recompute and overwrite a
        # b2b_price/mrp that may have been deliberately set to something
        # other than the formula result (a negotiated/rounded price) —
        # and since these fields are readonly in the admin, that overwrite
        # would happen with no visibility at all.
        pricing_inputs_changed = (
            self.pk is None
            or self.per_piece_price != self._original_per_piece_price
            or self.mrp_per_piece != self._original_mrp_per_piece
            or self.size_breakdown_id != self._original_size_breakdown_id
        )
        if pricing_inputs_changed:
            pieces = self.pieces
            if self.per_piece_price is not None:
                self.b2b_price = (self.per_piece_price * pieces).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if self.mrp_per_piece is not None:
                self.mrp = (self.mrp_per_piece * pieces).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

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

        self._original_per_piece_price   = self.per_piece_price
        self._original_mrp_per_piece     = self.mrp_per_piece
        self._original_size_breakdown_id = self.size_breakdown_id

    # ── Convenience properties used by serializer ─────────────────────────────

    @property
    def size(self):
        """Returns the size name string, e.g. 'L TO 3XL'. API-compatible."""
        return self.size_set.name if self.size_set else ''

    @property
    def set_breakdown(self):
        """Returns the breakdown string, e.g. '1xL, 1xXL, 1x2XL, 1x3XL'."""
        return self.size_breakdown.breakdown_string if self.size_breakdown else ''

    @property
    def pieces(self):
        """Number of garment pieces in this variation's set breakdown (1 if none)."""
        return self.size_breakdown.pieces if self.size_breakdown else 1

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