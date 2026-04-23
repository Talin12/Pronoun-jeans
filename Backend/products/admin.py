from django.contrib import admin
from .models import Category, Product, ProductVariation


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display        = ['name', 'slug', 'image']
    prepopulated_fields = {'slug': ('name',)}


class ProductVariationInline(admin.TabularInline):
    model  = ProductVariation
    extra  = 1
    fields = ['size', 'color', 'sku', 'b2b_price', 'stock_quantity']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display        = ['name', 'category', 'is_active', 'created_at']
    list_filter         = ['is_active', 'category']
    prepopulated_fields = {'slug': ('name',)}
    inlines             = [ProductVariationInline]


@admin.register(ProductVariation)
class ProductVariationAdmin(admin.ModelAdmin):
    list_display  = ['product', 'size', 'color', 'sku', 'b2b_price', 'stock_quantity']
    list_filter   = ['product']
    search_fields = ['sku', 'product__name']