from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver


@receiver(pre_save, sender='accounts.CustomUser')
def capture_previous_verified_state(sender, instance, **kwargs):
    """Store the previous is_verified_b2b value so post_save can detect the
    False -> True approval transition."""
    if instance.pk:
        try:
            instance._prev_is_verified_b2b = (
                sender.objects.values_list('is_verified_b2b', flat=True).get(pk=instance.pk)
            )
        except sender.DoesNotExist:
            instance._prev_is_verified_b2b = None
    else:
        instance._prev_is_verified_b2b = None


@receiver(post_save, sender='accounts.CustomUser')
def send_b2b_approved_notification(sender, instance, created, **kwargs):
    """Email the buyer when an admin approves them (is_verified_b2b False -> True).

    Skips creation — new verified buyers made through the agent "Create Buyer"
    flow already receive their own onboarding welcome email.
    """
    if created:
        return
    prev = getattr(instance, '_prev_is_verified_b2b', None)
    if prev or not instance.is_verified_b2b:
        return
    if not instance.email:
        return
    from core.email_utils import send_b2b_approved_email
    send_b2b_approved_email(instance)
