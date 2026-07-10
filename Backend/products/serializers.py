from rest_framework import serializers
from .models import Category, Product, ProductVariation, ProductImage, VariationImage


class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = Category
        fields = ['id', 'name', 'slug']


class CategorySerializer(serializers.ModelSerializer):
    subcategories = SubCategorySerializer(many=True, read_only=True)

    class Meta:
        model  = Category
        fields = ['id', 'name', 'slug', 'image', 'parent', 'subcategories']


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductImage
        fields = ['id', 'image', 'alt_text', 'order']


class VariationImageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = VariationImage
        fields = ['id', 'image', 'alt_text', 'order']


class ProductVariationSerializer(serializers.ModelSerializer):
    set_price         = serializers.DecimalField(source='b2b_price', max_digits=10, decimal_places=2, read_only=True)
    margin_percentage = serializers.SerializerMethodField()
    color_name        = serializers.SerializerMethodField()
    color_hex         = serializers.SerializerMethodField()
    gallery_images    = VariationImageSerializer(many=True, read_only=True)

    size          = serializers.SerializerMethodField()
    size_display  = serializers.SerializerMethodField()
    set_breakdown = serializers.SerializerMethodField()

    class Meta:
        model  = ProductVariation
        fields = [
            'id', 'size', 'size_display', 'color', 'color_name', 'color_hex',
            'sku',
            'set_price',
            'b2b_price',
            'per_piece_price',
            'mrp',
            'mrp_per_piece',
            'margin_percentage',
            'set_breakdown',
            'stock_quantity', 'image', 'gallery_images',
        ]

    def get_size(self, obj):
        """Returns the size name string e.g. 'L TO 3XL'. Same as before."""
        return obj.size_set.name if obj.size_set else ''

    def get_size_display(self, obj):
        """Returns the same name — no separate display label needed anymore."""
        return obj.size_set.name if obj.size_set else ''

    def get_set_breakdown(self, obj):
        """Returns the breakdown string e.g. '1xL, 1xXL, 1xXXL, 1x3XL'."""
        return obj.size_breakdown.breakdown_string if obj.size_breakdown else ''

    def get_margin_percentage(self, obj):
        try:
            if obj.per_piece_price and obj.mrp_per_piece and obj.mrp_per_piece > 0:
                margin = ((obj.mrp_per_piece - obj.per_piece_price) / obj.mrp_per_piece) * 100
            elif obj.mrp and obj.mrp > 0:
                margin = ((obj.mrp - obj.b2b_price) / obj.mrp) * 100
            else:
                return 0
            return round(float(margin), 1)
        except Exception:
            return 0

    def get_color_name(self, obj):
        if obj.color_palette:
            return obj.color_palette.name
        return obj.color or ''

    def get_color_hex(self, obj):
        if obj.color_palette:
            return obj.color_palette.hex_code
        return '#CCCCCC'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = request.user if request else None
        can_see_prices = (
            user and user.is_authenticated and
            (user.is_verified_b2b or user.is_agent or user.is_staff)
        )
        if not can_see_prices:
            for field in ('set_price', 'b2b_price', 'per_piece_price', 'mrp', 'mrp_per_piece', 'margin_percentage'):
                data[field] = None
        return data


class ProductSerializer(serializers.ModelSerializer):
    variations     = ProductVariationSerializer(many=True, read_only=True)
    category_name  = serializers.CharField(source='category.name', read_only=True)
    gallery_images = ProductImageSerializer(many=True, read_only=True)
    subcategories  = SubCategorySerializer(many=True, read_only=True)

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'slug', 'description', 'fabric_details',
            'category', 'category_name', 'subcategories', 'is_active', 'moq',
            'image', 'created_at', 'variations', 'gallery_images',
        ]