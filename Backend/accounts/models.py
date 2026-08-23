from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models, transaction
from django.db.models import Q


class CustomUser(AbstractUser):
    email            = models.EmailField(unique=True)
    company_name     = models.CharField(max_length=255, blank=True, null=True)
    gst_number       = models.CharField(max_length=15, blank=True, null=True)
    phone_number     = models.CharField(max_length=15, blank=True, null=True)
    is_verified_b2b  = models.BooleanField(default=False)
    is_agent         = models.BooleanField(default=False)
    assigned_agent   = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_buyers',
        limit_choices_to=Q(is_agent=True) | Q(agent_profile__isnull=False),
    )
    # Feature 1: buyer explicitly grants agent permission to order on their behalf
    agent_can_order  = models.BooleanField(
        default=False,
        help_text='Buyer grants their assigned agent permission to place orders on their behalf.',
    )

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email


class AgentProfile(models.Model):
    user                  = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name='agent_profile',
    )
    agent_code            = models.CharField(max_length=20, unique=True)
    commission_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    # Feature 3: bonus threshold constants
    BONUS_THRESHOLD = 500000   # ₹5,00,000
    BONUS_AMOUNT    = 5000     # ₹5,000 flat bonus

    def save(self, *args, **kwargs):
        if not self.user.is_agent:
            CustomUser.objects.filter(pk=self.user.pk).update(is_agent=True)
            self.user.is_agent = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.email} — {self.agent_code} ({self.commission_percentage}%)"


class AgentPayment(models.Model):
    """Admin manually logs payouts made to the agent."""
    agent         = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='payments_received',
        limit_choices_to={'is_agent': True},
    )
    amount        = models.DecimalField(max_digits=10, decimal_places=2)
    paid_on       = models.DateField()
    utr_reference = models.CharField(max_length=100, blank=True,
                                     help_text='Bank UTR / transaction reference for this payout')
    notes         = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_on']

    def __str__(self):
        return f"Payment ₹{self.amount} → {self.agent.email} on {self.paid_on}"


# Deliberately loose: Indian landlines, mobiles, and the "+91 " / "022-" /
# "(022) " shapes people actually type all have to pass. The point is to keep a
# name or a pasted sentence out of the field the courier will call, not to
# decide what a valid number looks like.
phone_validator = RegexValidator(
    regex=r'^[0-9+()\-\s]{7,20}$',
    message='Enter a phone number using digits, spaces, +, - or brackets.',
)


class Address(models.Model):
    user                = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='addresses')
    address_line_1      = models.CharField(max_length=255)
    address_line_2      = models.CharField(max_length=255, blank=True, null=True)
    city                = models.CharField(max_length=100)
    state               = models.CharField(max_length=100)
    pincode             = models.CharField(max_length=10)

    # Per-address contact details. Optional, and blank on every address that
    # existed before this — which is why nothing may require them.
    #
    # They are per address rather than per account because in wholesale the two
    # genuinely differ: goods go to a warehouse with its own manager and number,
    # while the invoice goes to the office. A courier calling the account holder
    # about a delivery to a site they have never visited is the failure this
    # prevents.
    contact_phone       = models.CharField(
        max_length=20, blank=True, validators=[phone_validator],
        help_text="Person to call about this address. Blank uses the account's number.",
    )
    contact_email       = models.EmailField(
        blank=True,
        help_text="Where paperwork for this address goes. Blank uses the account's email.",
    )

    is_default_shipping = models.BooleanField(default=False)
    is_default_billing  = models.BooleanField(default=False)

    class Meta:
        ordering = ['-is_default_shipping', 'id']

    # The fallback lives here rather than at each call site so the invoice, the
    # API and the panel cannot disagree about which number a courier should
    # ring. Blank means "use the account's", never "there isn't one".
    @property
    def effective_phone(self):
        return self.contact_phone or (self.user.phone_number if self.user_id else '') or ''

    @property
    def effective_email(self):
        return self.contact_email or (self.user.email if self.user_id else '') or ''

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.is_default_shipping:
                Address.objects.select_for_update().filter(
                    user=self.user, is_default_shipping=True
                ).exclude(pk=self.pk).update(is_default_shipping=False)
            if self.is_default_billing:
                Address.objects.select_for_update().filter(
                    user=self.user, is_default_billing=True
                ).exclude(pk=self.pk).update(is_default_billing=False)
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.address_line_1}, {self.city} — {self.user.email}"