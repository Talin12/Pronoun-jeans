# Backend/products/serializers.py

from rest_framework import serializers
from .models import Category, Product, ProductVariation


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "image"]


class ProductVariationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariation
        fields = ["id", "size", "color", "sku", "b2b_price", "stock_quantity"]


class ProductSerializer(serializers.ModelSerializer):
    variations = ProductVariationSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "description", "fabric_details",
            "category", "category_name", "is_active", "moq",
            "image", "created_at", "variations",
        ]