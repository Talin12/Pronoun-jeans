"""
Serializers for the superuser-only custom admin API.

These are deliberately separate from products/serializers.py (which is the
public, read-only storefront API): the admin needs to WRITE, needs to see
inactive/imageless products, and exposes management fields the storefront never
should. Image management is handled out-of-band via the media endpoints, so
these serializers treat images as read-only convenience data.
"""

from django.utils.text import slugify
from rest_framework import serializers

from products.models import (
    Category, Color, Product, ProductVariation, SizeSet, SizeSetBreakdown,
)


def _image_url(field):
    try:
        return field.url if field else None
    except Exception:
        return None


# ── Reference data (dropdowns) ─────────────────────────────────────────────────

class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Color
        fields = ['id', 'name', 'hex_code']


class SizeSetBreakdownSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SizeSetBreakdown
        fields = ['id', 'size_set', 'label', 'breakdown_string', 'pieces']


class SizeSetBreakdownNestedSerializer(serializers.ModelSerializer):
    """Breakdown as written inside a SizeSet create/update (no size_set FK)."""
    class Meta:
        model  = SizeSetBreakdown
        fields = ['id', 'label', 'breakdown_string', 'pieces']


class SizeSetSerializer(serializers.ModelSerializer):
    breakdowns = SizeSetBreakdownNestedSerializer(many=True, required=False)

    class Meta:
        model  = SizeSet
        fields = ['id', 'name', 'is_active', 'order', 'breakdowns']

    def create(self, validated):
        breakdowns = validated.pop('breakdowns', [])
        size_set = SizeSet.objects.create(**validated)
        for b in breakdowns:
            SizeSetBreakdown.objects.create(size_set=size_set, **b)
        return size_set

    def update(self, instance, validated):
        breakdowns = validated.pop('breakdowns', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if breakdowns is not None:
            # Full replace — the panel always sends the complete breakdown list.
            instance.breakdowns.all().delete()
            for b in breakdowns:
                SizeSetBreakdown.objects.create(size_set=instance, **b)
        return instance


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    image_url   = serializers.SerializerMethodField()

    class Meta:
        model  = Category
        fields = ['id', 'name', 'slug', 'parent', 'parent_name', 'image', 'image_url']
        extra_kwargs = {
            'image': {'write_only': True, 'required': False},
            'slug':  {'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # Auto-slug from name if not supplied.
        if not attrs.get('slug'):
            base = slugify(attrs.get('name') or getattr(self.instance, 'name', ''))
            slug = base or 'category'
            n = 2
            qs = Category.objects.exclude(pk=getattr(self.instance, 'pk', None))
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'; n += 1
            attrs['slug'] = slug
        return attrs


# ── Variations ─────────────────────────────────────────────────────────────────

class ProductVariationSerializer(serializers.ModelSerializer):
    color         = serializers.CharField(read_only=True)  # derived from color_palette
    size_name     = serializers.CharField(source='size_set.name', read_only=True)
    color_name    = serializers.CharField(source='color_palette.name', read_only=True)
    image_url     = serializers.SerializerMethodField()

    class Meta:
        model  = ProductVariation
        fields = [
            'id', 'product', 'size_set', 'size_name', 'size_breakdown',
            'color_palette', 'color', 'color_name', 'sku',
            'per_piece_price', 'mrp_per_piece', 'b2b_price', 'mrp',
            'stock_quantity', 'image', 'image_url',
        ]
        extra_kwargs = {
            'b2b_price': {'required': False},
            'mrp':       {'required': False},
            'image':     {'write_only': True, 'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # b2b_price auto-fills from per_piece_price × pieces in the model, but one
        # of the two must exist because b2b_price is required at the DB level.
        per_piece = attrs.get('per_piece_price',
                              getattr(self.instance, 'per_piece_price', None))
        b2b       = attrs.get('b2b_price',
                              getattr(self.instance, 'b2b_price', None))
        if per_piece in (None, '') and b2b in (None, ''):
            raise serializers.ValidationError({
                'per_piece_price': 'Enter a per-piece price (the total is calculated '
                                   'automatically) or fill in the total price directly.'
            })
        return attrs


# ── Products ───────────────────────────────────────────────────────────────────

class ProductListSerializer(serializers.ModelSerializer):
    category_name   = serializers.CharField(source='category.name', read_only=True)
    thumb           = serializers.SerializerMethodField()
    variation_count = serializers.IntegerField(read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'name', 'slug', 'category', 'category_name',
                  'is_active', 'moq', 'thumb', 'variation_count', 'created_at']

    def get_thumb(self, obj):
        return _image_url(obj.image)


class ProductDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    variations    = ProductVariationSerializer(many=True, read_only=True)
    image_url     = serializers.SerializerMethodField()

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'slug', 'category', 'category_name', 'subcategories',
            'description', 'fabric_details', 'is_active', 'moq',
            'image', 'image_url', 'variations', 'created_at',
        ]
        extra_kwargs = {
            'slug':  {'required': False},
            'image': {'write_only': True, 'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # Only auto-slug on create or when the name itself changes. A partial
        # update (e.g. the Active toggle on the product list) must never quietly
        # re-slug a live product and break its storefront URL.
        if not attrs.get('slug') and (self.instance is None or 'name' in attrs):
            base = slugify(attrs.get('name') or getattr(self.instance, 'name', ''))
            slug = base or 'product'
            n = 2
            qs = Product.objects.exclude(pk=getattr(self.instance, 'pk', None))
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'; n += 1
            attrs['slug'] = slug
        return attrs
