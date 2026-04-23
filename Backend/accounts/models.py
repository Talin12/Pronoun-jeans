from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    company_name = models.CharField(max_length=255, blank=True, null=True)
    gst_number = models.CharField(max_length=15, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    is_verified_b2b = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email


class Address(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='addresses')
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    is_default_shipping = models.BooleanField(default=False)
    is_default_billing = models.BooleanField(default=False)

    class Meta:
        ordering = ['-is_default_shipping', 'id']

    def save(self, *args, **kwargs):
        if self.is_default_shipping:
            Address.objects.filter(user=self.user, is_default_shipping=True).exclude(pk=self.pk).update(is_default_shipping=False)
        if self.is_default_billing:
            Address.objects.filter(user=self.user, is_default_billing=True).exclude(pk=self.pk).update(is_default_billing=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.address_line_1}, {self.city} — {self.user.email}"