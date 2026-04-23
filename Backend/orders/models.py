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
    cart      = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey('products.ProductVariation', on_delete=models.CASCADE)
    quantity  = models.PositiveIntegerField(default=0)

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

    class PaymentMethod(models.TextChoices):
        RAZORPAY      = 'razorpay',      'Razorpay'
        NET_30        = 'net_30',        'Net 30 Terms'
        BANK_TRANSFER = 'bank_transfer', 'Direct Bank Transfer'

    class PaymentStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID    = 'paid',    'Paid'
        FAILED  = 'failed',  'Failed'

    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders')
    shipping_address = models.ForeignKey('accounts.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='shipping_orders')
    billing_address  = models.ForeignKey('accounts.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='billing_orders')
    status           = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_method   = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.BANK_TRANSFER)
    payment_status   = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    total_amount     = models.DecimalField(max_digits=10, decimal_places=2)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order#{self.pk} — {self.user.email} [{self.status}]"


class OrderItem(models.Model):
    order     = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey('products.ProductVariation', on_delete=models.PROTECT)
    quantity  = models.PositiveIntegerField()
    price     = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.variation.sku} x{self.quantity} @ {self.price}"