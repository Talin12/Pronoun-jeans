from django.db import models
from django.conf import settings
from django.utils import timezone

from core.utils.images import CompressedImageField


class Coupon(models.Model):
    class DiscountType(models.TextChoices):
        PERCENTAGE   = 'percentage',   'Percentage'
        FIXED_AMOUNT = 'fixed_amount', 'Fixed Amount'

    code            = models.CharField(max_length=50, unique=True, db_index=True)
    discount_type   = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
    discount_value  = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active       = models.BooleanField(default=True)
    valid_from      = models.DateTimeField()
    valid_to        = models.DateTimeField()
    created_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} ({self.get_discount_type_display()} — {self.discount_value})"

    def is_valid(self):
        now = timezone.now()
        return self.is_active and self.valid_from <= now <= self.valid_to

    def calculate_discount(self, cart_total):
        from decimal import Decimal
        if self.discount_type == self.DiscountType.PERCENTAGE:
            discount = (Decimal(str(self.discount_value)) / Decimal('100')) * cart_total
        else:
            discount = Decimal(str(self.discount_value))
        return min(discount, cart_total).quantize(Decimal('0.01'))


class Cart(models.Model):
    user       = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart({self.user.email})"


class CartItem(models.Model):
    cart      = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey(
        'products.ProductVariation',
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    quantity  = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('cart', 'variation')

    def __str__(self):
        sku = self.variation.sku if self.variation_id else '[removed]'
        return f"{sku} x{self.quantity}"


class Order(models.Model):

    class Status(models.TextChoices):
        PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pending Verification'
        PENDING              = 'PENDING',   'Pending'
        APPROVED             = 'APPROVED',  'Approved'
        SHIPPED              = 'SHIPPED',   'Shipped'
        DELIVERED            = 'DELIVERED', 'Delivered'
        CANCELLED            = 'CANCELLED', 'Cancelled'

    class PaymentMethod(models.TextChoices):
        RAZORPAY   = 'razorpay',   'Razorpay'
        DIRECT_UPI = 'direct_upi', 'Direct UPI'

    class PaymentStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID    = 'paid',    'Paid'
        PARTIAL = 'partial', 'Partial'
        FAILED  = 'failed',  'Failed'

    class PaymentPlan(models.TextChoices):
        ADVANCE = 'advance', '10% Advance'
        FULL    = 'full',    'Full Payment (1% off)'

    class PaymentProofType(models.TextChoices):
        UTR        = 'utr',        'UTR Number'
        SCREENSHOT = 'screenshot', 'Payment Screenshot'
        NONE       = 'none',       'No Proof (Manual Verification)'

    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    shipping_address = models.ForeignKey('accounts.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='shipping_orders')
    billing_address  = models.ForeignKey('accounts.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='billing_orders')
    status           = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING)
    payment_method   = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.DIRECT_UPI)
    payment_status   = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    total_amount     = models.DecimalField(max_digits=10, decimal_places=2)

    coupon          = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    payment_plan      = models.CharField(max_length=10, choices=PaymentPlan.choices, null=True, blank=True)
    upi_discount      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    balance_due       = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Payment proof fields
    payment_proof_type  = models.CharField(
        max_length=15,
        choices=PaymentProofType.choices,
        default=PaymentProofType.NONE,
        help_text='What proof of payment the buyer submitted.',
    )
    utr_number          = models.CharField(max_length=50, null=True, blank=True,
                                           help_text='UPI Transaction Reference ID provided by buyer')
    payment_screenshot  = CompressedImageField(
        upload_to='payment_receipts/',
        null=True, blank=True,
        help_text='Screenshot of payment success screen uploaded by buyer',
    )
    payment_verified    = models.BooleanField(default=False,
                                              help_text='Admin toggles this after confirming payment in bank')

    # Razorpay
    razorpay_order_id   = models.CharField(max_length=100, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=100, null=True, blank=True)
    razorpay_signature  = models.CharField(max_length=255, null=True, blank=True)

    # Tracking
    courier_name    = models.CharField(max_length=100, null=True, blank=True)
    tracking_number = models.CharField(max_length=100, null=True, blank=True)
    tracking_url    = models.URLField(null=True, blank=True)

    # OOBO
    placed_by_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='orders_placed_on_behalf',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def grand_total(self):
        from decimal import Decimal
        subtotal  = max(self.total_amount - Decimal(str(self.discount_amount)), Decimal('0'))
        after_upi = max(subtotal - Decimal(str(self.upi_discount)), Decimal('0'))
        SHIPPING_FEE            = Decimal('300.00')
        FREE_SHIPPING_THRESHOLD = Decimal('15000.00')
        shipping = SHIPPING_FEE if after_upi < FREE_SHIPPING_THRESHOLD else Decimal('0.00')
        return after_upi + shipping

    def save(self, *args, **kwargs):
        if self.payment_verified and self.status == self.Status.PENDING_VERIFICATION:
            self.status         = self.Status.APPROVED
            self.payment_status = self.PaymentStatus.PAID if self.balance_due == 0 else self.PaymentStatus.PARTIAL
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order#{self.pk} — {self.user.email} [{self.status}]"


class OrderItem(models.Model):
    order     = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    variation = models.ForeignKey('products.ProductVariation', on_delete=models.SET_NULL, null=True, blank=True)
    quantity  = models.PositiveIntegerField()
    price     = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.variation.sku} x{self.quantity} @ {self.price}"


class Commission(models.Model):
    class Status(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        PAID    = 'Paid',    'Paid'

    agent                 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='commissions',
        limit_choices_to={'is_agent': True},
    )
    order                 = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name='commission',
        null=True, blank=True,
    )
    commission_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    amount                = models.DecimalField(max_digits=10, decimal_places=2)
    status                = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at            = models.DateTimeField(auto_now_add=True)
    paid_at               = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        if self.order:
            return f"Commission — {self.agent.email} | Order#{self.order.pk} | ₹{self.amount} [{self.status}]"
        return f"Bonus Commission — {self.agent.email} | ₹{self.amount} [{self.status}]"


class SampleOrder(models.Model):
    class Status(models.TextChoices):
        PENDING    = 'PENDING',    'Pending'
        CONFIRMED  = 'CONFIRMED',  'Confirmed'
        DISPATCHED = 'DISPATCHED', 'Dispatched'
        COMPLETED  = 'COMPLETED',  'Completed'
        CANCELLED  = 'CANCELLED',  'Cancelled'

    design_number = models.CharField(max_length=100)
    rate          = models.DecimalField(max_digits=10, decimal_places=2)
    date          = models.DateField()
    status        = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    buyer         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sample_orders',
    )
    agent         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='agent_sample_orders',
        limit_choices_to={'is_agent': True},
    )
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"Sample D.No.{self.design_number} — {self.buyer.email} | ₹{self.rate}"