# Backend/products/models.py

from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, related_name="products"
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    fabric_details = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    moq = models.PositiveIntegerField(default=10, help_text="Minimum Order Quantity for B2B clients")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ProductVariation(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variations"
    )
    size = models.CharField(max_length=50)
    color = models.CharField(max_length=100)
    sku = models.CharField(max_length=100, unique=True)
    b2b_price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("product", "size", "color")
        verbose_name = "Product Variation"

    def __str__(self):
        return f"{self.product.name} | {self.size} | {self.color} ({self.sku})"