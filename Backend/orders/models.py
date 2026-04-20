# Backend/orders/models.py

from django.db import models
from django.conf import settings


class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart({self.user.email})"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey(
        'products.ProductVariation', on_delete=models.CASCADE
    )
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('cart', 'variation')

    def __str__(self):
        return f"{self.variation.sku} x{self.quantity}"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING   = 'PENDING',   'Pending'
        APPROVED  = 'APPROVED',  'Approved'
        SHIPPED   = 'SHIPPED',   'Shipped'
        DELIVERED = 'DELIVERED', 'Delivered'
        CANCELLED = 'CANCELLED', 'Cancelled'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders'
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order#{self.pk} — {self.user.email} [{self.status}]"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey(
        'products.ProductVariation', on_delete=models.PROTECT
    )
    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)  # locked at order time

    def __str__(self):
        return f"{self.variation.sku} x{self.quantity} @ {self.price}"